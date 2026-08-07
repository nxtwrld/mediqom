/**
 * Name-fidelity gate for the GLB conversion, and the source of
 * `src/data/anatomy-manifest.json`.
 *
 * Two DIFFERENT checks live here, and conflating them makes the gate useless:
 *
 *   1. GATE — names present in the source .obj but absent from the .glb.
 *      That is conversion damage, and it exits non-zero. Without this check a
 *      converter that merges or renames nodes fails silently: nothing errors,
 *      nothing highlights, because the whole highlight system keys off
 *      `scene.getObjectByName()` with exact-case names.
 *
 *   2. REPORT — names objects.json declares that the geometry never contained.
 *      These are pre-existing phantoms, not conversion damage, and the gap
 *      differs per sex. They are recorded in anatomy-manifest.json so the
 *      resolver can filter against real geometry instead of the vocabulary.
 *
 * Usage:
 *   node verify.mjs                 # verify every GLB present, write manifest
 *   node verify.mjs --no-manifest   # verify only (use for partial conversions)
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAYER_FILES, SEXES, glbPath, objPath } from "./convert.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const OBJECTS_JSON = path.join(REPO, "src/data/objects.json");
const MANIFEST = path.join(REPO, "src/data/anatomy-manifest.json");

/** Group / object names declared in an .obj, streamed (files reach 62 MB). */
async function objGroupNames(file) {
  const names = new Set();
  const rl = readline.createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line[0] !== "g" && line[0] !== "o") continue;
    if (line[1] !== " ") continue;
    const name = line.slice(2).trim();
    if (name && name !== "default") names.add(name);
  }
  return names;
}

/**
 * Node names present in a GLB — deliberately NOT mesh names. three's GLTFLoader
 * takes `Object3D.name` from the glTF *node*, which is what
 * `scene.getObjectByName()` and `checkObject()` match against. obj2gltf suffixes
 * the mesh objects (`L_talus` node -> `L_talus_1` mesh); counting those would
 * both inflate the tally and hide a real node-name regression.
 */
async function glbNames(io, file) {
  const doc = await io.read(file);
  const names = new Set();
  for (const node of doc.getRoot().listNodes()) {
    if (node.getName()) names.add(node.getName());
  }
  return names;
}

/** Every mesh name objects.json declares, across all layers. */
async function declaredNames() {
  const objects = JSON.parse(await readFile(OBJECTS_JSON, "utf8"));
  const all = new Set();
  for (const layer of Object.values(objects)) {
    for (const name of layer.objects) all.add(name);
  }
  return all;
}

async function main() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

  const writeManifest = !process.argv.includes("--no-manifest");
  const declared = await declaredNames();

  const manifest = {};
  const damaged = [];
  let checked = 0;

  for (const sex of SEXES) {
    const presentDeclared = new Set();
    let complete = true;

    for (const id of LAYER_FILES) {
      const glb = glbPath(sex, id);
      const obj = objPath(sex, id);
      if (!existsSync(glb)) {
        complete = false;
        continue;
      }
      checked += 1;

      const inGlb = await glbNames(io, glb);
      const inObj = existsSync(obj) ? await objGroupNames(obj) : null;
      const label = `${sex}_${id}`;

      // (1) GATE — source names that did not survive conversion.
      const lost = inObj ? [...inObj].filter((n) => !inGlb.has(n)) : [];

      // (2) inventory — declared names actually backed by geometry.
      for (const n of inGlb) if (declared.has(n)) presentDeclared.add(n);

      const src = inObj ? inObj.size : "?";
      if (lost.length) {
        console.log(
          `${label.padEnd(34)} obj ${String(src).padStart(3)} -> glb ${String(inGlb.size).padStart(3)}   LOST ${lost.length}`,
        );
        damaged.push({ label, lost });
      } else {
        console.log(
          `${label.padEnd(34)} obj ${String(src).padStart(3)} -> glb ${String(inGlb.size).padStart(3)}   ok`,
        );
      }
    }

    if (complete) manifest[sex] = [...presentDeclared].sort();
    else console.log(`  (${sex}: partial conversion — manifest entry skipped)`);
  }

  if (checked === 0) {
    console.error("\nNo GLBs found. Run `node convert.mjs` first.");
    process.exit(1);
  }

  console.log("");
  for (const sex of Object.keys(manifest)) {
    const phantom = [...declared].filter((n) => !manifest[sex].includes(n));
    console.log(
      `${sex}: ${manifest[sex].length}/${declared.size} declared names backed by geometry — ${phantom.length} phantom`,
    );
    if (phantom.length) console.log(`  ${phantom.sort().join(", ")}`);
  }

  if (writeManifest && Object.keys(manifest).length === SEXES.length) {
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`\nwrote ${path.relative(REPO, MANIFEST)}`);
  }

  if (damaged.length) {
    console.error(`\nGATE FAILED — ${damaged.length} layer(s) lost names during conversion:`);
    for (const d of damaged) {
      console.error(`  ${d.label}: ${d.lost.slice(0, 20).join(", ")}${d.lost.length > 20 ? ` … +${d.lost.length - 20}` : ""}`);
    }
    console.error("\nNever call join() or flatten(); keep prune({ keepLeaves: true }).");
    process.exit(1);
  }

  console.log("\nGATE PASSED — every source mesh name survived conversion, exact-case.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
