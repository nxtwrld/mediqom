#!/usr/bin/env node
/**
 * Apply Draco compression to all GLB files in output/glb/
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB_DIR = join(__dirname, 'output', 'glb');
const OUT_DIR = join(__dirname, 'output', 'glb-draco');

import { mkdirSync } from 'fs';
mkdirSync(OUT_DIR, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
io.registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
});

const files = readdirSync(GLB_DIR).filter(f => f.endsWith('.glb') && !f.includes('draco'));
let totalBefore = 0, totalAfter = 0;

for (const file of files) {
    const inPath = join(GLB_DIR, file);
    const outPath = join(OUT_DIR, file);
    const beforeSize = statSync(inPath).size;
    totalBefore += beforeSize;

    console.log(`Compressing ${file} (${(beforeSize / 1024 / 1024).toFixed(2)} MB)...`);

    const doc = await io.read(inPath);
    await doc.transform(draco());
    const glb = await io.writeBinary(doc);
    writeFileSync(outPath, Buffer.from(glb));

    const afterSize = glb.byteLength;
    totalAfter += afterSize;
    const ratio = ((1 - afterSize / beforeSize) * 100).toFixed(0);
    console.log(`  → ${(afterSize / 1024 / 1024).toFixed(2)} MB (${ratio}% reduction)`);
}

console.log(`\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
