/**
 * OBJ -> meshopt-compressed GLB converter for the anatomy models.
 *
 * Reads  static/anatomy_models/{sex}_{id}_obj/{id}.obj
 * Writes static/anatomy_models_glb/{sex}_{id}.glb
 *
 * The hard constraint is NODE-NAME FIDELITY: the whole highlight system keys off
 * `scene.getObjectByName()` with exact-case mesh names from objects.json, so any
 * transform that merges or renames nodes silently destroys highlighting, labels
 * and Care Plan painting at once. `join()` and `flatten()` are therefore never
 * called, and `prune()` runs with `keepLeaves: true`.
 *
 * Usage:
 *   node convert.mjs                  # all 9 layers x 2 sexes
 *   node convert.mjs male_skeletal_system male_organs
 */
import { NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import obj2gltf from "obj2gltf";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const SRC = path.join(REPO, "static/anatomy_models");
const OUT = path.join(REPO, "static/anatomy_models_glb");

/** The 9 distinct .obj basenames, from objects.json `files[]`. */
export const LAYER_FILES = [
  "cartilage_tissue",
  "connective_tissue",
  "integumentary_system",
  "lymphatic_system",
  "muscular_system",
  "nervous_system",
  "organs",
  "skeletal_system",
  "vascular_system",
];

export const SEXES = ["male", "female"];

/** All 18 {sex, id} pairs. */
export function allTargets() {
  return SEXES.flatMap((sex) => LAYER_FILES.map((id) => ({ sex, id })));
}

export const objPath = (sex, id) => path.join(SRC, `${sex}_${id}_obj`, `${id}.obj`);
export const glbPath = (sex, id) => path.join(OUT, `${sex}_${id}.glb`);

// EXTMeshoptCompression reaches for the encoder through the IO dependency
// registry at write time, not through the transform's `encoder` option.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder })
  .setLogger(new Logger(Logger.Verbosity.ERROR));

async function convertOne(sex, id) {
  const input = objPath(sex, id);
  if (!existsSync(input)) return { sex, id, skipped: "no source obj" };

  const before = (await stat(input)).size;

  // obj2gltf keeps OBJ group names as glTF mesh/node names. `separate: false`
  // keeps buffers embedded; there are no textures in any of these models.
  const gltfJson = await obj2gltf(input, {
    separate: false,
    checkTransparency: false,
    secure: true,
    logger: () => {},
  });

  const doc = await io.readJSON({
    json: gltfJson,
    resources: {},
  });
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));

  await doc.transform(
    // Normals are recomputed at load (`computeVertexNormals()` in model-loader),
    // and no material in any .mtl references a texture map, so UVs are dead weight.
    clearAttributes(["NORMAL", "TEXCOORD_0"]),
    dedup(),
    // keepLeaves is load-bearing: named empties ARE the contract.
    prune({ keepAttributes: false, keepLeaves: true }),
    weld(),
    // meshopt() quantizes internally (14-bit position by default) and applies
    // EXT_meshopt_compression. Do not also call quantize() — that double-quantizes.
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  await mkdir(OUT, { recursive: true });
  const glb = await io.writeBinary(doc);
  await writeFile(glbPath(sex, id), glb);

  return { sex, id, before, after: glb.byteLength };
}

/** Strip a vertex attribute from every primitive. */
function clearAttributes(semantics) {
  return (doc) => {
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        for (const semantic of semantics) {
          if (prim.getAttribute(semantic)) prim.setAttribute(semantic, null);
        }
      }
    }
  };
}

const fmt = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const fmtKb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  await MeshoptEncoder.ready;

  const filter = process.argv.slice(2);
  const targets = allTargets().filter(
    ({ sex, id }) => filter.length === 0 || filter.includes(`${sex}_${id}`),
  );

  if (targets.length === 0) {
    console.error(`No targets matched ${JSON.stringify(filter)}`);
    process.exit(1);
  }

  let totalBefore = 0;
  let totalAfter = 0;
  const failures = [];

  for (const { sex, id } of targets) {
    const label = `${sex}_${id}`;
    process.stdout.write(`${label.padEnd(34)} `);
    try {
      const r = await convertOne(sex, id);
      if (r.skipped) {
        console.log(`SKIP (${r.skipped})`);
        continue;
      }
      totalBefore += r.before;
      totalAfter += r.after;
      const ratio = (r.before / r.after).toFixed(0);
      console.log(`${fmt(r.before).padStart(9)} -> ${fmtKb(r.after).padStart(8)}  (${ratio}x)`);
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failures.push({ label, err });
    }
  }

  console.log(
    `\ntotal ${fmt(totalBefore)} -> ${fmt(totalAfter)} ` +
      `(${(totalBefore / Math.max(totalAfter, 1)).toFixed(0)}x)`,
  );

  if (failures.length) {
    console.error(`\n${failures.length} conversion(s) failed.`);
    for (const f of failures) console.error(`  ${f.label}: ${f.err.stack}`);
    process.exit(1);
  }
  console.log(`\nNow run: node verify.mjs`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
