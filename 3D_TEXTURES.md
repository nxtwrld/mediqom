# 3D Texture Pipeline: Blender Prep, glTF Export, Three.js Integration

Complete reference for converting the raw anatomy source textures into web-ready glTF assets with PBR materials for Three.js rendering.

## Current State Summary

| Fact                         | Detail                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OBJ UV coordinates**       | All systems have UVs. Muscular system: 65K `vt` entries, 312 groups, all sharing `usemtl wire_088088225` (single material, one UV space)               |
| **Texture naming**           | `<part>_<type>.<ext>` — CM (color), NM (normal), DM (displacement), BM (bump), OM (opacity)                                                            |
| **Source textures**          | ~110 male, ~110 female files. Formats: TIF (48MB), BMP (48MB), PNG, JPG. Resolution: 4096x4096+                                                        |
| **Blender file**             | `aouros/assets-src/AnatomyModel/full_male_anatomy_blender/full_male_anatomy.blend` with all textures alongside                                         |
| **Texture-to-mesh mapping**  | Locked in `.max`/`.blend` files. MTL exports only contain flat colors — no texture references                                                          |
| **Muscular system textures** | Body-region based (toroso_CM, arm_CM, upleg_CM, lowerleg_CM, face_CM) — NOT per-muscle. The 312 muscles share UV space mapped to these region textures |

---

## Blender Workflow

### Step 1: Open the Existing Blender File

```
File → Open → full_male_anatomy_blender/full_male_anatomy.blend
```

The `.blend` file already has the full model with textures referenced from the original 3DS Max → Blender conversion.

**Verify:** Switch to Material Preview mode (`Z` → Material Preview) to confirm textures render on meshes.

### Step 2: Verify/Fix UV Mapping

1. Select a muscular system mesh (e.g., `rectus_abdominis`)
2. Open UV Editor (top menu → UV Editing workspace)
3. In Edit Mode, select all faces (`A`) → check UV layout
4. The UVs should map cleanly onto the body-region texture (e.g., `toroso_CM.tif`)

**Potential issue:** If the Blender import lost UV associations, re-import the OBJ into the Blender scene and transfer UVs. The OBJ UVs are intact.

### Step 3: Set Up PBR Materials (Principled BSDF)

For each system, create a Principled BSDF shader node setup:

```
Shader Editor layout per material:

[Image Texture: toroso_CM.tif] → Base Color
[Image Texture: toroso_NM.tif] → [Normal Map node] → Normal
[Image Texture: toroso_BM.tif] → [Bump node] → Normal (chain after Normal Map)
[Image Texture: toroso_DM.tif] → Displacement (see Step 5)
                                   ↓
                            [Principled BSDF]
                                   ↓
                            [Material Output]
```

**Key settings on Principled BSDF:**

| Parameter          | Value                            | Reason                                |
| ------------------ | -------------------------------- | ------------------------------------- |
| Roughness          | 0.65                             | Muscles are moist but not mirror-like |
| Metallic           | 0.0                              | Organic tissue                        |
| Subsurface Weight  | 0.05–0.1                         | Subtle SSS for fleshy look            |
| Subsurface Color   | Slightly warmer/redder than base | Realistic skin/muscle scattering      |
| Specular IOR Level | 0.5                              | Default                               |

### Step 4: Handle Normal Maps — Tangent Space Conversion

**Problem:** 3DS Max / VRay uses **DirectX tangent space** (Y-/green-down). Three.js uses **OpenGL tangent space** (Y+/green-up).

**In Blender:**

1. On the Normal Map node: set Space to **Tangent**
2. On the Image Texture node for normal maps: set Color Space to **Non-Color**
3. Check if normals look correct in Blender viewport (Blender uses OpenGL convention natively):
   - If they look correct → already OpenGL → no flip needed
   - If lighting looks inverted → source is DirectX → flip green channel

**To flip green channel in Blender:**
Add a `Separate RGB` → `Invert` (green only) → `Combine RGB` node chain before the Normal Map node.

**Three.js side:** When loading glTF exported correctly from Blender, no additional flip is needed.

### Step 5: Handle Displacement Maps

Displacement maps (`_DM.tif`) have three options for web delivery:

#### Option A: Bake Displacement → Normal Map (RECOMMENDED)

Displacement maps in Three.js require geometry subdivision at runtime (very expensive: 312 meshes × subdivision = massive vertex count). Instead, bake displacement detail into normal maps:

1. Apply a **Subdivision Surface** modifier (level 2-3) to the mesh
2. Apply a **Displace** modifier using the DM texture
3. **Bake** the resulting normals to a new normal map:
   - Create a new target image (2048x2048)
   - Bake Type: Normal (Tangent Space)
   - This combines the displacement detail into the normal map
4. Remove the modifiers and use the baked normal map instead

This gives displacement-quality surface detail at zero runtime cost.

#### Option B: Keep as Displacement in Three.js (NOT recommended)

```typescript
material.displacementMap = dmTexture;
material.displacementScale = 0.1; // tune per system
```

Problem: Only works with sufficiently subdivided geometry. The OBJ meshes are low-poly for the detail DM expects.

#### Option C: Convert to Bump Map

Use the DM as a bump map (cheaper than displacement, better than nothing):

```typescript
material.bumpMap = dmTexture;
material.bumpScale = 0.5;
```

### Step 6: Texture Optimization for Web

The source textures are **48MB TIF/BMP** (4096x4096+). Target sizes for web:

| Target                | Resolution | Format                   | Est. Size       |
| --------------------- | ---------- | ------------------------ | --------------- |
| Desktop               | 2048x2048  | JPG (quality 85) or WebP | 200-500 KB each |
| Mobile                | 1024x1024  | JPG (quality 80) or WebP | 50-150 KB each  |
| KTX2/Basis (advanced) | 2048x2048  | GPU-compressed           | 100-300 KB each |

**In Blender:**

1. Image Editor → Image → Scale: resize to 2048x2048
2. Image → Save As: choose JPG or PNG
3. Repeat for all CM, NM, baked-NM textures

**Batch process outside Blender (ImageMagick):**

```bash
# Color maps — lossy compression is fine
for f in *_CM.tif; do
  convert "$f" -resize 2048x2048 -quality 85 "${f%.tif}.jpg"
done

# Normal maps — MUST use lossless (JPG artifacts corrupt normal data)
for f in *_NM.tif; do
  convert "$f" -resize 2048x2048 "${f%.tif}.png"
done
```

**Important:** Normal maps must always be PNG or KTX2 (lossless). Never use JPG for normal maps.

### Step 7: Export as glTF/GLB

This is the **most critical step** — glTF is Three.js's preferred format and preserves materials/textures.

**In Blender:** File → Export → glTF 2.0 (.glb/.gltf)

| Setting                | Value                                   | Why                               |
| ---------------------- | --------------------------------------- | --------------------------------- |
| Format                 | glTF Separate (.gltf + .bin + textures) | Allows texture swapping, caching  |
| Include                | Selected Objects (export per system)    | Separate files per anatomy system |
| Transform → Y Up       | Yes                                     | Three.js uses Y-up                |
| Mesh → Apply Modifiers | Yes                                     | Flatten subdivision etc.          |
| Mesh → UVs             | Yes                                     | Preserve UV mapping               |
| Mesh → Normals         | Yes                                     | Preserve vertex normals           |
| Mesh → Tangents        | Yes                                     | Required for normal maps          |
| Material → Images      | JPEG/WebP or None (if separate)         | Web-optimized                     |
| Compression → Draco    | Yes                                     | 75-85% geometry size reduction    |

**Export per system** — one glTF per anatomy layer:

```
muscular_system.glb
skeletal_system.glb
organs.glb
vascular_system.glb
...
```

### Step 8: Verify in Three.js

After export, load with `GLTFLoader` instead of `OBJLoader` + `MTLLoader`:

```typescript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/"); // host Draco WASM decoder

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load("/anatomy_models/muscular_system.glb", (gltf) => {
  const model = gltf.scene;
  // Materials, textures, normals all loaded automatically
  scene.add(model);
});
```

**glTF automatically handles:**

- Material/texture slot assignments (base color, normal, etc.)
- Correct tangent space for normal maps
- PBR metallic-roughness workflow
- Texture coordinate mapping

---

## Adaptive Texture Loading (Mobile vs Desktop)

```typescript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TextureLoader } from "three";

const isMobile =
  /Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

const textureRes = isMobile ? "1024" : "2048";
const texturePath = `/anatomy_textures/${textureRes}/`;

// If using glTF Separate format, swap texture paths after load:
gltfLoader.load(`/anatomy_models/muscular_system.gltf`, (gltf) => {
  gltf.scene.traverse((child) => {
    if (child.isMesh && child.material.map) {
      const texName = child.material.map.name;
      const loader = new TextureLoader();
      child.material.map = loader.load(`${texturePath}${texName}`);
      child.material.map.flipY = false; // glTF convention
    }
  });
  scene.add(gltf.scene);
});
```

---

## Gotchas Checklist

| Issue                            | Fix                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Normal map Y-flip**            | Check in Blender viewport first. If lighting looks wrong, flip green channel. glTF export handles OpenGL convention automatically |
| **Color space**                  | CM textures = sRGB. NM/BM/DM textures = Non-Color (linear). Set in Image Texture node                                             |
| **Displacement at runtime**      | Don't use `displacementMap` — bake into normals instead (Step 5 Option A)                                                         |
| **Texture resolution**           | Max 2048x2048 for web. Normal maps: PNG/KTX2 only (no JPG)                                                                        |
| **glTF uses metallic-roughness** | Not specular-glossiness. Principled BSDF maps correctly                                                                           |
| **Mesh names preserved**         | glTF export keeps Blender object names → Three.js `scene.getObjectByName()` still works                                           |
| **312 draw calls**               | Each muscle = separate mesh = separate draw call. Future optimization: merge muscles by body region into texture atlases          |
| **Draco decoder**                | Must host WASM files at `/draco/` path. Copy from `node_modules/three/examples/jsm/libs/draco/`                                   |
| **Mobile texture memory**        | 8 textures x 2048² x 4 bytes = ~128MB GPU RAM. Use 1024² on mobile (~32MB)                                                        |
| **glTF flipY**                   | glTF uses `flipY = false` convention. If loading textures manually, set `texture.flipY = false`                                   |

---

## Recommended Workflow Priority

Since the **Blender file already exists** with textures:

1. **Open `full_male_anatomy.blend`** — verify materials are intact
2. **Focus on muscular system first** — isolate muscular meshes
3. **Verify normals** — check green channel convention
4. **Bake displacement → normal** for torso, arm, upleg, lowerleg regions
5. **Resize textures** — 2048 desktop / 1024 mobile
6. **Export glTF** with Draco compression
7. **Update `Body.svelte`** — swap OBJLoader for GLTFLoader
8. **Repeat** for other systems (organs, skeletal, etc.)

---

## File Inventory — Available Source Textures

### Muscular System (Body-Region Based)

All 312 muscles share one UV space mapped to these region textures.

| Body Region    | CM (Color) | NM (Normal) | DM (Displacement) | BM (Bump) |
| -------------- | :--------: | :---------: | :---------------: | :-------: |
| toroso (torso) |    TIF     |      -      |         -         |    TIF    |
| arm            |    TIF     |      -      |         -         |    TIF    |
| upleg          |    TIF     |      -      |         -         |    TIF    |
| lowerleg       |    TIF     |      -      |         -         |    TIF    |
| face           |    TIF     |      -      |        TIF        |     -     |

### Skeletal System

| Region | CM  | NM  | DM  | BM  |
| ------ | :-: | :-: | :-: | :-: |
| skull  | JPG |  -  | JPG |  -  |
| spine  | JPG |  -  | JPG |  -  |

### Organs

| Organ        | CM  | NM  | DM  | BM  |
| ------------ | :-: | :-: | :-: | :-: |
| closed_heart | JPG | JPG | JPG |  -  |
| liver_right  | TIF | TIF |  -  |  -  |
| liver_left   | TIF | TIF |  -  |  -  |
| stomach      | TIF | TIF |  -  |  -  |
| kidneys      | TIF |  -  | TIF |  -  |
| brain        | TIF |  -  |  -  |  -  |
| lungs        | TIF |  -  | TIF |  -  |

### Texture Type Key

| Code | Full Name        | Color Space        | Web Format                 |
| ---- | ---------------- | ------------------ | -------------------------- |
| CM   | Color Map        | sRGB               | JPG / WebP                 |
| NM   | Normal Map       | Non-Color (Linear) | PNG / KTX2 (lossless only) |
| DM   | Displacement Map | Non-Color (Linear) | Bake into NM (see Step 5)  |
| BM   | Bump Map         | Non-Color (Linear) | PNG / KTX2                 |
| OM   | Opacity Map      | Non-Color (Linear) | PNG (alpha channel)        |

---

## Source File Locations

```
aouros/assets-src/AnatomyModel/
├── full_male_anatomy_blender/
│   ├── full_male_anatomy.blend          ← Primary Blender file
│   └── textures/                        ← All texture files alongside
├── full_male_anatomy/
│   ├── *.obj, *.mtl                     ← OBJ exports (UVs intact, no texture refs in MTL)
│   └── textures/
├── full_female_anatomy/
│   └── textures/                        ← ~110 female texture files
└── ...
```

## Draco Decoder Setup

To use Draco-compressed glTF, host the decoder WASM files:

```bash
# Copy Draco decoder files to static directory
cp -r node_modules/three/examples/jsm/libs/draco/ static/draco/
```

Files needed in `static/draco/`:

- `draco_decoder.wasm`
- `draco_wasm_wrapper.js`
- `draco_decoder.js` (fallback for non-WASM browsers)
