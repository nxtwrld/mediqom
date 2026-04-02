#!/usr/bin/env node
/**
 * BodyParts3D Hierarchy Parser v3
 *
 * Hybrid approach: uses PART-OF for region/system grouping,
 * IS-A for classification (muscles, bones, etc.), and element parts
 * from both to maximize mesh file coverage.
 *
 * Usage: node parse-hierarchy.js
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, 'source');
const OUTPUT_DIR = join(__dirname, 'output');
mkdirSync(OUTPUT_DIR, { recursive: true });

function parseTSV(filename) {
    const content = readFileSync(join(SOURCE_DIR, filename), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    lines.shift();
    return lines.map(l => l.split('\t'));
}

// ─── Parse all data sources ──────────────────────────────────────────────────

console.log('Loading data...');

// IS-A
const isaPartsRows = parseTSV('isa_parts_list_e.txt');
const isaHierarchyRows = parseTSV('isa_inclusion_relation_list.txt');
const isaElementRows = parseTSV('isa_element_parts.txt');

const isaNames = new Map();
for (const [fma, bp, name] of isaPartsRows) isaNames.set(fma, name);

const isaChildren = new Map();
for (const [pid, pn, cid, cn] of isaHierarchyRows) {
    if (!isaChildren.has(pid)) isaChildren.set(pid, []);
    isaChildren.get(pid).push(cid);
}

const isaConceptToFiles = new Map();
const isaFileToConcepts = new Map();
for (const [fma, name, fj] of isaElementRows) {
    if (!isaConceptToFiles.has(fma)) isaConceptToFiles.set(fma, new Set());
    isaConceptToFiles.get(fma).add(fj);
    if (!isaFileToConcepts.has(fj)) isaFileToConcepts.set(fj, new Set());
    isaFileToConcepts.get(fj).add(fma);
}

// PART-OF
const partofPartsRows = parseTSV('partof_parts_list_e.txt');
const partofHierarchyRows = parseTSV('partof_inclusion_relation_list.txt');
const partofElementRows = parseTSV('partof_element_parts.txt');

const partofNames = new Map();
for (const [fma, bp, name] of partofPartsRows) partofNames.set(fma, name);

const partofChildren = new Map();
for (const [pid, pn, cid, cn] of partofHierarchyRows) {
    if (!partofChildren.has(pid)) partofChildren.set(pid, []);
    partofChildren.get(pid).push(cid);
}

const partofConceptToFiles = new Map();
for (const [fma, name, fj] of partofElementRows) {
    if (!partofConceptToFiles.has(fma)) partofConceptToFiles.set(fma, new Set());
    partofConceptToFiles.get(fma).add(fj);
}

// Available OBJ files
const objDir = join(SOURCE_DIR, 'obj_models', 'isa_BP3D_4.0_obj_99');
const availableFiles = new Set(
    readdirSync(objDir).filter(f => f.endsWith('.obj')).map(f => f.replace('.obj', ''))
);
console.log(`  IS-A: ${isaNames.size} parts | PART-OF: ${partofNames.size} parts | OBJ files: ${availableFiles.size}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDescendants(rootId, childMap, visited = new Set()) {
    if (visited.has(rootId)) return visited;
    visited.add(rootId);
    for (const kid of (childMap.get(rootId) || [])) {
        getDescendants(kid, childMap, visited);
    }
    return visited;
}

function collectFiles(fmaIds, conceptToFilesMap) {
    const files = new Set();
    for (const fma of fmaIds) {
        const f = conceptToFilesMap.get(fma);
        if (f) f.forEach(fj => { if (availableFiles.has(fj)) files.add(fj); });
    }
    return files;
}

function getName(fmaId) {
    return partofNames.get(fmaId) || isaNames.get(fmaId) || fmaId;
}

// ─── System definitions ─────────────────────────────────────────────────────
// Strategy: use IS-A roots for organ-type classification (muscles, bones)
// and PART-OF roots for region-based systems (vascular, nervous, digestive)

const SYSTEMS = [
    {
        name: 'skeleton',
        label: 'Skeletal System',
        // IS-A: bone organ + cartilage
        isaRoots: ['FMA5018', 'FMA7538'],
        // PART-OF: musculoskeletal system → skeletal system
        partofRoots: ['FMA23881'],
        color: '#E8D5B7',
        opacity: 0.9
    },
    {
        name: 'muscular',
        label: 'Muscular System',
        // IS-A: muscle organ + zone of muscle organ + head of muscle organ + anatomical set (muscle sets)
        isaRoots: ['FMA5022', 'FMA10474', 'FMA85453', 'FMA55652'],
        partofRoots: [],
        color: '#8B2500',
        opacity: 0.9
    },
    {
        name: 'vascular',
        label: 'Vascular System',
        // IS-A: vascular tree + segment of artery + vein + artery + vein (broader)
        isaRoots: ['FMA3710', 'FMA3711', 'FMA3714', 'FMA3726', 'FMA50720', 'FMA50723', 'FMA50722'],
        // PART-OF: cardiovascular system + vasculature
        partofRoots: ['FMA7161', 'FMA228642'],
        color: '#CC0000',
        opacity: 0.9
    },
    {
        name: 'nervous',
        label: 'Nervous System',
        // IS-A: brain, spinal cord, peripheral nerve, nerve, cranial nerve branch
        isaRoots: ['FMA5890', 'FMA5897', 'FMA9903', 'FMA5906', 'FMA65132', 'FMA5848'],
        // PART-OF: nervous system
        partofRoots: ['FMA7157'],
        color: '#FFD700',
        opacity: 0.9
    },
    {
        name: 'respiratory',
        label: 'Respiratory System',
        isaRoots: [],
        // PART-OF: respiratory system
        partofRoots: ['FMA7158'],
        color: '#F0BABA',
        opacity: 0.9
    },
    {
        name: 'digestive',
        label: 'Digestive System',
        // IS-A: tooth (includes all 32 teeth)
        isaRoots: ['FMA12516'],
        // PART-OF: alimentary system
        partofRoots: ['FMA7152'],
        color: '#CD853F',
        opacity: 0.9
    },
    {
        name: 'urogenital',
        label: 'Urogenital System',
        // IS-A: kidney, testis, prostate, adrenal gland, ureter, urinary bladder
        isaRoots: ['FMA7203', 'FMA7210', 'FMA9600', 'FMA9604', 'FMA9704', 'FMA15900'],
        // PART-OF: urinary system + genital system
        partofRoots: ['FMA7159', 'FMA7160'],
        color: '#D1B58C',
        opacity: 0.9
    },
    {
        name: 'skin',
        label: 'Integumentary',
        isaRoots: ['FMA7163'],
        partofRoots: ['FMA72979', 'FMA74657'],
        color: '#FFE4C4',
        opacity: 0.3
    },
    {
        name: 'lymphatic',
        label: 'Lymphatic System',
        isaRoots: ['FMA5034', 'FMA7410', 'FMA5884'],
        partofRoots: [],
        color: '#90EE90',
        opacity: 0.9
    }
];

// ─── Collect files for each system ───────────────────────────────────────────

console.log('\nGrouping by system (hybrid IS-A + PART-OF)...');
const systemResults = {};
const assignedFiles = new Set();

for (const sys of SYSTEMS) {
    // Collect descendants from both hierarchies
    const isaDescendants = new Set();
    for (const r of sys.isaRoots) getDescendants(r, isaChildren, isaDescendants);

    const partofDescendants = new Set();
    for (const r of sys.partofRoots) getDescendants(r, partofChildren, partofDescendants);

    // Collect mesh files from both element mappings
    const isaFiles = collectFiles(isaDescendants, isaConceptToFiles);
    const partofFiles = collectFiles(partofDescendants, partofConceptToFiles);

    // Union
    const allFiles = new Set([...isaFiles, ...partofFiles]);

    // Build parts map (FMA → { name, files })
    const parts = new Map();
    const allConcepts = new Set([...isaDescendants, ...partofDescendants]);
    for (const fma of allConcepts) {
        const isaF = isaConceptToFiles.get(fma);
        const partofF = partofConceptToFiles.get(fma);
        const files = new Set();
        if (isaF) isaF.forEach(f => { if (availableFiles.has(f) && allFiles.has(f)) files.add(f); });
        if (partofF) partofF.forEach(f => { if (availableFiles.has(f) && allFiles.has(f)) files.add(f); });
        if (files.size > 0) {
            parts.set(fma, { name: getName(fma), files: [...files] });
        }
    }

    allFiles.forEach(f => assignedFiles.add(f));
    systemResults[sys.name] = { files: allFiles, parts, config: sys };
    console.log(`  ${sys.name}: ${parts.size} concepts, ${allFiles.size} mesh files`);
}

const unassigned = [...availableFiles].filter(f => !assignedFiles.has(f));
console.log(`\n  Total assigned: ${assignedFiles.size} / ${availableFiles.size}`);
console.log(`  Unassigned: ${unassigned.length}`);

// Show sample unassigned
if (unassigned.length > 0) {
    console.log('\n  Sample unassigned:');
    unassigned.slice(0, 20).forEach(fj => {
        const concepts = isaFileToConcepts.get(fj);
        if (concepts) {
            let best = null, bestSize = Infinity;
            for (const c of concepts) {
                const sz = isaConceptToFiles.get(c)?.size || Infinity;
                if (sz < bestSize) { bestSize = sz; best = c; }
            }
            console.log(`    ${fj}: ${isaNames.get(best) || best} (${best})`);
        }
    });
}

// ─── Most-specific name per FJ file ──────────────────────────────────────────

function getMostSpecificName(fjId) {
    const concepts = isaFileToConcepts.get(fjId);
    if (!concepts) return fjId;
    let best = null, bestSize = Infinity;
    for (const fmaId of concepts) {
        const sz = isaConceptToFiles.get(fmaId)?.size || Infinity;
        if (sz < bestSize) { bestSize = sz; best = fmaId; }
    }
    return best ? (isaNames.get(best) || best) : fjId;
}

function toMeshId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Generate outputs ────────────────────────────────────────────────────────

const fileNames = {};
const fileFmaIds = {};
for (const fj of availableFiles) {
    fileNames[fj] = getMostSpecificName(fj);
    // Also store the FMA ID for the most specific concept
    const concepts = isaFileToConcepts.get(fj);
    if (concepts) {
        let best = null, bestSize = Infinity;
        for (const c of concepts) {
            const sz = isaConceptToFiles.get(c)?.size || Infinity;
            if (sz < bestSize) { bestSize = sz; best = c; }
        }
        fileFmaIds[fj] = best;
    }
}

// 1. File mapping: FJ → { name, fmaId, meshId }
const fileMapping = {};
for (const fj of availableFiles) {
    fileMapping[fj] = {
        name: fileNames[fj],
        fmaId: fileFmaIds[fj] || null,
        meshId: toMeshId(fileNames[fj])
    };
}
writeFileSync(join(OUTPUT_DIR, 'file-mapping.json'), JSON.stringify(fileMapping, null, 2));

// 2. objects.json for viewer
const objectsJson = {};
for (const sys of SYSTEMS) {
    const result = systemResults[sys.name];
    const meshIds = [...result.files].map(fj => fileMapping[fj]?.meshId || fj);
    objectsJson[sys.name] = {
        files: [sys.name],
        objects: [...new Set(meshIds)], // deduplicate
        color: sys.color,
        opacity: sys.opacity
    };
}
writeFileSync(join(OUTPUT_DIR, 'objects.json'), JSON.stringify(objectsJson, null, 2));

// 3. FJ-to-system (for GLB grouping in conversion)
const fjToSystem = {};
for (const sys of SYSTEMS) {
    for (const fj of systemResults[sys.name].files) {
        if (!fjToSystem[fj]) fjToSystem[fj] = sys.name;
    }
}
for (const fj of unassigned) fjToSystem[fj] = 'other';
writeFileSync(join(OUTPUT_DIR, 'fj-to-system.json'), JSON.stringify(fjToSystem, null, 2));

// 4. Systems detail
const systemsDetail = {};
for (const sys of SYSTEMS) {
    const result = systemResults[sys.name];
    systemsDetail[sys.name] = {
        label: sys.label,
        color: sys.color,
        opacity: sys.opacity,
        meshCount: result.files.size,
        conceptCount: result.parts.size,
        meshFiles: [...result.files].map(fj => ({
            fjId: fj,
            name: fileNames[fj],
            meshId: toMeshId(fileNames[fj]),
            fmaId: fileFmaIds[fj]
        }))
    };
}
writeFileSync(join(OUTPUT_DIR, 'systems-detail.json'), JSON.stringify(systemsDetail, null, 2));

// 5. Stats
const stats = {
    totalMeshFiles: availableFiles.size,
    assignedFiles: assignedFiles.size,
    unassignedFiles: unassigned.length,
    systems: Object.fromEntries(
        SYSTEMS.map(s => [s.name, {
            label: s.label,
            concepts: systemResults[s.name].parts.size,
            meshFiles: systemResults[s.name].files.size
        }])
    )
};
writeFileSync(join(OUTPUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));

console.log('\n=== Output written to ./output/ ===');
console.log(JSON.stringify(stats, null, 2));
