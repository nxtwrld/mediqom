#!/usr/bin/env node
/**
 * BodyParts3D OBJ → GLB Conversion Pipeline
 *
 * Groups individual OBJ files by body system and converts each system
 * into a single optimized GLB file with Draco compression.
 *
 * Usage: node convert-to-glb.js [--system skeleton] [--no-draco]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import obj2gltf from 'obj2gltf';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, quantize, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, 'source');
const OUTPUT_DIR = join(__dirname, 'output');
const OBJ_DIR = join(SOURCE_DIR, 'obj_models', 'isa_BP3D_4.0_obj_99');
const GLB_DIR = join(OUTPUT_DIR, 'glb');
mkdirSync(GLB_DIR, { recursive: true });

// ─── Coordinate alignment: BodyParts3D → v1 model space ──────────────────────
// v1 (current OBJ):  Y-up, height Y: 6→1843, width X: ±372, depth Z: -709→-406
// v2 (BodyParts3D):  Z-up, height Z: -70→1636, width X: ±324, depth Y: -236→18
//
// Transform: 1) Rotate Z-up → Y-up:  newX=X, newY=Z, newZ=-Y
//            2) Scale to match v1 height: 1837/1707 ≈ 1.076
//            3) Translate to align base: v1 baseY≈6, v2 after rotate baseY≈-70 → shift +76
const V1_HEIGHT = 1837;   // v1: 1843 - 6
const V2_HEIGHT = 1707;   // v2: 1636 - (-70)
const SCALE = V1_HEIGHT / V2_HEIGHT;  // ~1.076
const V1_BASE_Y = 6;
const V2_BASE_Z = -70;    // becomes Y after rotation
const TRANSLATE_Y = V1_BASE_Y - (V2_BASE_Z * SCALE);  // align base Y

// Align Z (depth): v1 center Z ≈ -557, v2 after rotation center Z depends on Y range
// v2 Y range: -236→18, after rotation becomes Z: 236→-18 (negated), center ≈ 109
// v1 Z center: (-709 + -406)/2 = -557.5
// Shift: -557.5 - 109 = -666.5
const V1_Z_CENTER = (-709 + -406) / 2;       // ≈ -557.5
const V2_Y_CENTER = (-236 + 18) / 2;         // ≈ -109 (before negate: center at 109 after rotation)
const TRANSLATE_Z = V1_Z_CENTER - (-V2_Y_CENTER * SCALE);  // align depth

function transformPositions(posArray) {
    // posArray is a Float32Array of [x,y,z, x,y,z, ...]
    for (let i = 0; i < posArray.length; i += 3) {
        const x = posArray[i];
        const y = posArray[i + 1];
        const z = posArray[i + 2];
        // Rotate Z-up → Y-up: newX=X, newY=Z, newZ=-Y, then scale + translate
        posArray[i]     = x * SCALE;
        posArray[i + 1] = z * SCALE + TRANSLATE_Y;
        posArray[i + 2] = -y * SCALE + TRANSLATE_Z;
    }
}

function transformNormals(normArray) {
    // Same rotation but no scale/translate for normals
    for (let i = 0; i < normArray.length; i += 3) {
        const x = normArray[i];
        const y = normArray[i + 1];
        const z = normArray[i + 2];
        normArray[i]     = x;
        normArray[i + 1] = z;
        normArray[i + 2] = -y;
    }
}

// ─── System-specific material colors (BodyParts3D has no materials) ───────────
const SYSTEM_COLORS = {
    skeleton:    [0.91, 0.84, 0.72, 1],  // bone ivory
    muscular:    [0.55, 0.15, 0.00, 1],  // deep red (overridden by muscle-materials.ts at runtime)
    vascular:    [0.80, 0.00, 0.00, 1],  // red
    nervous:     [1.00, 0.84, 0.00, 1],  // gold
    respiratory: [0.94, 0.73, 0.73, 1],  // pink
    digestive:   [0.80, 0.52, 0.25, 1],  // tan
    urogenital:  [0.82, 0.71, 0.55, 1],  // khaki
    lymphatic:   [0.56, 0.93, 0.56, 1],  // green
    skin:        [1.00, 0.89, 0.77, 1],  // peach
    other:       [0.70, 0.70, 0.70, 1],  // gray
};

// Parse args
const args = process.argv.slice(2);
const targetSystem = args.includes('--system') ? args[args.indexOf('--system') + 1] : null;
const useDraco = !args.includes('--no-draco');

// Load mappings from parse-hierarchy output
const fjToSystem = JSON.parse(readFileSync(join(OUTPUT_DIR, 'fj-to-system.json'), 'utf-8'));
const fileMapping = JSON.parse(readFileSync(join(OUTPUT_DIR, 'file-mapping.json'), 'utf-8'));

// Group files by system
const systemGroups = {};
for (const [fjId, system] of Object.entries(fjToSystem)) {
    if (!systemGroups[system]) systemGroups[system] = [];
    systemGroups[system].push(fjId);
}

console.log('Systems to convert:');
for (const [sys, files] of Object.entries(systemGroups)) {
    if (targetSystem && sys !== targetSystem) continue;
    console.log(`  ${sys}: ${files.length} OBJ files`);
}

// ─── Convert a single OBJ to glTF buffer ─────────────────────────────────────

async function convertObjToGltf(objPath) {
    const gltf = await obj2gltf(objPath, {
        binary: true,
        separate: false,
    });
    return Buffer.from(gltf);
}

// ─── Merge multiple GLBs into one using gltf-transform ───────────────────────

async function mergeAndOptimize(fjIds, systemName) {
    console.log(`\nConverting ${systemName} (${fjIds.length} meshes)...`);

    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS);

    if (useDraco) {
        io.registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
        });
    }

    // Create a new document to merge into
    const { Document } = await import('@gltf-transform/core');
    const mergedDoc = new Document();
    const mergedScene = mergedDoc.createScene(systemName);
    const mergedBuffer = mergedDoc.createBuffer();

    let converted = 0;
    let failed = 0;

    for (const fjId of fjIds) {
        const objPath = join(OBJ_DIR, `${fjId}.obj`);
        if (!existsSync(objPath)) {
            console.log(`  SKIP ${fjId}: OBJ not found`);
            failed++;
            continue;
        }

        try {
            // Convert OBJ → GLB buffer
            const glbBuffer = await convertObjToGltf(objPath);

            // Read as gltf-transform document
            const doc = await io.readBinary(new Uint8Array(glbBuffer));
            const root = doc.getRoot();
            const scenes = root.listScenes();

            if (scenes.length === 0) {
                console.log(`  SKIP ${fjId}: no scenes`);
                failed++;
                continue;
            }

            // Get the mesh name from our mapping
            const mapping = fileMapping[fjId];
            const meshName = mapping?.meshId || fjId;

            // Extract all meshes from the source document and add to merged
            for (const scene of scenes) {
                for (const node of scene.listChildren()) {
                    const mesh = node.getMesh();
                    if (!mesh) continue;

                    // Copy primitives
                    const newMesh = mergedDoc.createMesh(meshName);

                    for (const prim of mesh.listPrimitives()) {
                        const newPrim = mergedDoc.createPrimitive();

                        // Copy attributes with coordinate transform
                        for (const semantic of prim.listSemantics()) {
                            const accessor = prim.getAttribute(semantic);
                            if (!accessor) continue;
                            const arr = accessor.getArray().slice();
                            // Transform positions and normals to match v1 coordinate space
                            if (semantic === 'POSITION') {
                                transformPositions(arr);
                            } else if (semantic === 'NORMAL') {
                                transformNormals(arr);
                            }
                            const newAccessor = mergedDoc.createAccessor()
                                .setType(accessor.getType())
                                .setArray(arr)
                                .setBuffer(mergedBuffer);
                            newPrim.setAttribute(semantic, newAccessor);
                        }

                        // Copy indices
                        const indices = prim.getIndices();
                        if (indices) {
                            const newIndices = mergedDoc.createAccessor()
                                .setType(indices.getType())
                                .setArray(indices.getArray().slice())
                                .setBuffer(mergedBuffer);
                            newPrim.setIndices(newIndices);
                        }

                        // Create a simple material
                        // Apply system-specific color (BodyParts3D has no materials)
                        {
                            const color = SYSTEM_COLORS[systemName] || SYSTEM_COLORS.other;
                            const newMat = mergedDoc.createMaterial(meshName)
                                .setBaseColorFactor(color)
                                .setRoughnessFactor(0.7)
                                .setMetallicFactor(0.0);
                            if (false) { // keep block structure for future alpha support
                            }
                            newPrim.setMaterial(newMat);
                        }

                        newMesh.addPrimitive(newPrim);
                    }

                    // Create node with the mesh
                    const newNode = mergedDoc.createNode(meshName)
                        .setMesh(newMesh);

                    // Copy transform
                    newNode.setTranslation(node.getTranslation());
                    newNode.setRotation(node.getRotation());
                    newNode.setScale(node.getScale());

                    mergedScene.addChild(newNode);
                }
            }

            converted++;
            if (converted % 50 === 0) {
                console.log(`  ${converted}/${fjIds.length} converted...`);
            }
        } catch (err) {
            console.log(`  FAIL ${fjId}: ${err.message}`);
            failed++;
        }
    }

    console.log(`  Converted: ${converted}, Failed: ${failed}`);

    // Optimize
    console.log('  Optimizing...');
    await mergedDoc.transform(
        dedup(),
        quantize(),
    );

    if (useDraco) {
        console.log('  Applying Draco compression...');
        await mergedDoc.transform(
            draco(),
        );
    }

    // Write output
    const outPath = join(GLB_DIR, `${systemName}.glb`);
    const glb = await io.writeBinary(mergedDoc);
    writeFileSync(outPath, Buffer.from(glb));

    const sizeMB = (glb.byteLength / 1024 / 1024).toFixed(2);
    console.log(`  Written: ${outPath} (${sizeMB} MB)`);

    return { converted, failed, sizeMB: parseFloat(sizeMB) };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const results = {};

    for (const [sys, fjIds] of Object.entries(systemGroups)) {
        if (targetSystem && sys !== targetSystem) continue;
        if (sys === 'other') continue; // skip unassigned for now

        try {
            results[sys] = await mergeAndOptimize(fjIds, sys);
        } catch (err) {
            console.error(`  ERROR ${sys}: ${err.message}`);
            results[sys] = { error: err.message };
        }
    }

    console.log('\n=== Conversion Summary ===');
    let totalSize = 0;
    for (const [sys, result] of Object.entries(results)) {
        if (result.error) {
            console.log(`  ${sys}: ERROR - ${result.error}`);
        } else {
            console.log(`  ${sys}: ${result.converted} meshes, ${result.sizeMB} MB`);
            totalSize += result.sizeMB;
        }
    }
    console.log(`  TOTAL: ${totalSize.toFixed(2)} MB`);
}

main().catch(console.error);
