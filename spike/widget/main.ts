/**
 * SLICE ZERO — throwaway. Minimal anatomy renderer for the ChatGPT sandbox probes.
 *
 * Deliberately does NOT use `Body.svelte` or any `src/components/anatomy/`
 * module. Its only production import is `regionMeshes`, which is pure. The job
 * is to answer five questions and then be deleted:
 *
 *   0b-A  does WebGL render in the sandboxed iframe at all?
 *   0b-B  does a cross-origin GLB fetch succeed with connectDomains declared?
 *   0b-C  at what size does ChatGPT truncate an inlined HTML resource?
 *   0b-D  can a 2 KB bootstrap execute an external <script src>?
 *   0c    will the model call the tool in the right situations?
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { regionMeshes } from "$data/anatomy-regions";
import { filesForLayer } from "$lib/anatomy/layers";
import type { AnatomyLayer } from "$lib/anatomy/types";
import {
  initBridge,
  note,
  onToolOutput,
  openExternal,
  type AnatomyToolOutput,
} from "./bridge";

/** Baked in at build time; the tool result may override it per request. */
declare const __ASSET_BASE__: string;
declare const __VARIANT__: string;

const DEFAULT_ASSET_BASE =
  typeof __ASSET_BASE__ !== "undefined" ? __ASSET_BASE__ : "";
const VARIANT = typeof __VARIANT__ !== "undefined" ? __VARIANT__ : "dev";

const HIGHLIGHT = new THREE.Color(0x16d3dd);
const DIMMED = new THREE.Color(0x8899aa);

const root = document.getElementById("root")!;
const statusEl = document.createElement("div");
statusEl.className = "status";
root.appendChild(statusEl);

function status(msg: string) {
  statusEl.textContent = msg;
  note(msg);
}

// ── Scene ────────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
let controls: OrbitControls;
let loaded: THREE.Object3D | null = null;

function initScene(): boolean {
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(root.clientWidth || 640, root.clientHeight || 480);
    root.appendChild(renderer.domElement);
  } catch (err) {
    // 0b-A answered in the negative.
    status(`WebGL unavailable: ${(err as Error).message}`);
    return false;
  }

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1, 1, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-1, -0.5, -1);
  scene.add(fill);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = Infinity;

  window.addEventListener("resize", resize);
  resize();
  animate();
  return true;
}

function resize() {
  const w = root.clientWidth || 640;
  const h = root.clientHeight || 480;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene, camera);
}

// ── Model ────────────────────────────────────────────────────────────────────

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/**
 * Skeleton is always loaded as the spatial anchor; any layer the tool result
 * names is loaded alongside it. Several concurrent cross-origin fetches make
 * probe 0b-B a stronger test than a single one would be.
 */
function filesFor(out: AnatomyToolOutput): string[] {
  const layers = (out.layers ?? []) as AnatomyLayer[];
  const files = new Set<string>(["skeletal_system"]);
  for (const layer of layers) {
    for (const file of filesForLayer(layer)) files.add(file);
  }
  return [...files];
}

async function showStructure(out: AnatomyToolOutput) {
  const sex = out.sex ?? "male";
  const base = out.assetBase ?? DEFAULT_ASSET_BASE;
  const files = filesFor(out);

  status(`fetching ${files.length} layer(s) from ${base}`);

  let results: Awaited<ReturnType<typeof loader.loadAsync>>[];
  try {
    results = await Promise.all(
      files.map((f) =>
        loader.loadAsync(`${base}/anatomy_models_glb/${sex}_${f}.glb`),
      ),
    );
  } catch (err) {
    // 0b-B answered in the negative — this is the CSP result we care about.
    status(`GLB fetch FAILED (CSP?): ${(err as Error).message}`);
    return;
  }

  if (loaded) scene.remove(loaded);
  loaded = new THREE.Group();
  for (const gltf of results) loaded.add(gltf.scene);
  scene.add(loaded);

  const wanted = new Set(
    out.meshes?.length ? out.meshes : regionMeshes(out.structure ?? "whole_body"),
  );
  applyHighlight(loaded, wanted);
  frame(loaded, wanted);

  const found = [...wanted].filter((n) => loaded!.getObjectByName(n)).length;
  status(
    `${VARIANT} · ${sex} · ${files.join("+")} · ${found}/${wanted.size} meshes matched`,
  );
}

function applyHighlight(rootObj: THREE.Object3D, wanted: Set<string>) {
  rootObj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    // The pipeline strips NORMAL (they were being discarded at load anyway), so
    // they must be recomputed or every lit material renders black. This mirrors
    // `computeVertexNormals()` in model-loader.ts:306, and is the single most
    // important thing `loadGlb` has to carry over from `loadObj`.
    if (!mesh.geometry.getAttribute("normal")) mesh.geometry.computeVertexNormals();

    const hit = wanted.size === 0 || wanted.has(child.name);
    const mat = new THREE.MeshStandardMaterial({
      color: hit ? HIGHLIGHT : DIMMED,
      transparent: !hit,
      opacity: hit ? 1 : 0.12,
      roughness: 0.7,
      metalness: 0.05,
    });
    mesh.material = mat;
  });
}

/**
 * Frame from the bounding sphere of actual geometry, so this is unit-invariant:
 * the female 160-unit world and the male 1500-unit world both work unchanged.
 */
function frame(rootObj: THREE.Object3D, wanted: Set<string>) {
  const box = new THREE.Box3();
  let any = false;
  for (const name of wanted) {
    const obj = rootObj.getObjectByName(name);
    if (!obj) continue;
    box.expandByObject(obj);
    any = true;
  }
  if (!any) box.setFromObject(rootObj);

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!isFinite(sphere.radius) || sphere.radius <= 0) return;

  const fov = (camera.fov * Math.PI) / 180;
  const distance = (sphere.radius * 2.2) / Math.sin(fov / 2);

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, distance));
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  controls.update();
}

// ── Footer handoff (AI_PLUGIN.md §9b: informational only, one CTA) ──────────

function addFooter() {
  const footer = document.createElement("button");
  footer.className = "cta";
  footer.textContent = "How Mediqom keeps records connected over time";
  footer.addEventListener("click", () =>
    openExternal("https://mediqom.com/www/en/about"),
  );
  root.appendChild(footer);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

initBridge();
if (initScene()) {
  addFooter();
  status(`${VARIANT} ready — waiting for tool output`);
  onToolOutput((out) => {
    void showStructure(out);
  });
}
