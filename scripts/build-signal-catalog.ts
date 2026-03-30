/**
 * Build Signal Catalog
 *
 * Merges data from multiple source files into a single signal-catalog.json.
 * Run with: npx tsx scripts/build-signal-catalog.ts
 *
 * Sources:
 * - lab.properties.defaults.json (type, unit, referenceRange, expiration)
 * - lab.properties.json (description, low/high interpretation, links)
 * - lab.synonyms.json (synonym arrays including Czech/German variants)
 * - normalize.ts SIGNAL_ALIASES (English aliases → canonical key)
 * - health-normalize.ts ENTITY_MAP (HealthKit type → signal key)
 * - Hand-curated LOINC codes for common signals
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../src/data');

// =====================================================
// Load source files
// =====================================================

const defaults: Record<string, any> = JSON.parse(
	readFileSync(resolve(DATA_DIR, 'lab.properties.defaults.json'), 'utf-8')
);

const properties: Array<{
	term: string;
	key: string;
	description?: string;
	low?: string;
	high?: string;
	links?: string[];
	expiration?: number;
}> = JSON.parse(readFileSync(resolve(DATA_DIR, 'lab.properties.json'), 'utf-8'));

const synonymArrays: string[][] = JSON.parse(
	readFileSync(resolve(DATA_DIR, 'lab.synonyms.json'), 'utf-8')
);

// =====================================================
// SIGNAL_ALIASES from normalize.ts (hardcoded here for the build script)
// =====================================================

const SIGNAL_ALIASES: Record<string, string> = {
	pulse: 'resting_heart_rate',
	hr: 'resting_heart_rate',
	'heart rate': 'resting_heart_rate',
	heartrate: 'resting_heart_rate',
	'resting heart rate': 'resting_heart_rate',
	'resting pulse': 'resting_heart_rate',
	hrv: 'heart_rate_variability',
	'bp systolic': 'systolic',
	'systolic blood pressure': 'systolic',
	'systolic bp': 'systolic',
	'bp diastolic': 'diastolic',
	'diastolic blood pressure': 'diastolic',
	'diastolic bp': 'diastolic',
	'blood glucose': 'blood_sugar',
	'fasting glucose': 'blood_sugar',
	'fasting blood sugar': 'blood_sugar',
	spo2: 'oxygen_saturation',
	'o2 saturation': 'oxygen_saturation',
	'blood oxygen': 'oxygen_saturation',
	'breathing rate': 'respiratory_rate',
	'resp rate': 'respiratory_rate',
	'body mass index': 'bmi',
	'body fat': 'body_fat_percentage',
	'total cholesterol': 'cholesterol',
	hdl: 'hdl_cholesterol',
	ldl: 'ldl_cholesterol',
	wbc: 'white_blood_cells',
	rbc: 'red_blood_cells',
	hgb: 'hemoglobin',
	hb: 'hemoglobin',
	hct: 'hematocrit',
	plt: 'platelets',
	'alanine aminotransferase': 'alt',
	'aspartate aminotransferase': 'ast',
	'gamma-glutamyl transferase': 'ggt',
	'alkaline phosphatase': 'alp',
	gfr: 'egfr',
	'glomerular filtration rate': 'egfr',
	'free t4': 'ft4',
	thyroxine: 'ft4',
	'thyroid stimulating hormone': 'tsh',
	'c-reactive protein': 'crp',
	'sed rate': 'esr',
	'sedimentation rate': 'esr',
	'vitamin d': 'vitamin_d',
	'25-hydroxyvitamin d': 'vitamin_d'
};

// =====================================================
// HealthKit entity mappings
// =====================================================

const HEALTHKIT_MAP: Record<string, string> = {
	heart_rate: 'heart_rate',
	'heart_rate.resting': 'resting_heart_rate',
	'heart_rate.variability': 'heart_rate_variability',
	blood_pressure_systolic: 'systolic',
	blood_pressure_diastolic: 'diastolic',
	blood_glucose: 'blood_sugar',
	weight: 'weight',
	height: 'height',
	fat_percentage: 'body_fat_percentage'
};

// Reverse: signal → healthKitType
const signalToHealthKit: Record<string, string> = {};
for (const [hkType, signal] of Object.entries(HEALTHKIT_MAP)) {
	if (!signalToHealthKit[signal]) {
		signalToHealthKit[signal] = hkType;
	}
}

// =====================================================
// Hand-curated LOINC codes for common signals
// =====================================================

const LOINC_CODES: Record<string, string[]> = {
	resting_heart_rate: ['8867-4'],
	systolic: ['8480-6'],
	diastolic: ['8462-4'],
	temperature: ['8310-5'],
	respiratory_rate: ['9279-1'],
	oxygen_saturation: ['2708-6'],
	weight: ['29463-7'],
	height: ['8302-2'],
	bmi: ['39156-5'],
	blood_sugar: ['2339-0'],
	glucose: ['2345-7'],
	hemoglobin: ['718-7'],
	hematocrit: ['4544-3'],
	white_blood_cells: ['6690-2'],
	red_blood_cells: ['789-8'],
	platelets: ['777-3'],
	mcv: ['787-2'],
	mch: ['785-6'],
	mchc: ['786-4'],
	rdw: ['788-0'],
	neutrophils: ['770-8'],
	lymphocytes: ['736-9'],
	monocytes: ['5905-5'],
	eosinophils: ['713-8'],
	basophils: ['706-2'],
	absolute_neutrophils: ['751-8'],
	absolute_lymphocytes: ['731-0'],
	absolute_monocytes: ['742-7'],
	absolute_eosinophils: ['711-2'],
	absolute_basophils: ['704-7'],
	sodium: ['2951-2'],
	potassium: ['2823-3'],
	chloride: ['2075-0'],
	magnesium: ['19123-9'],
	iron: ['2498-4'],
	ferritin: ['2276-4'],
	creatinine: ['2160-0'],
	urea: ['3094-0'],
	uric_acid: ['3084-1'],
	egfr: ['48642-3'],
	bilirubin: ['1975-2'],
	alt: ['1742-6'],
	ast: ['1920-8'],
	ggt: ['2324-2'],
	alp: ['6768-6'],
	total_protein: ['2885-2'],
	albumin: ['1751-7'],
	cholesterol: ['2093-3'],
	hdl_cholesterol: ['2085-9'],
	ldl_cholesterol: ['13457-7'],
	triglycerides: ['2571-8'],
	crp: ['1988-5'],
	tsh: ['3016-3'],
	ft4: ['3024-7'],
	vitamin_d: ['1989-3'],
	esr: ['4537-7']
};

// =====================================================
// Map synonym display names → canonical keys
// =====================================================

// Build display name → key from lab.properties.json
const displayNameToKey: Record<string, string> = {};
for (const prop of properties) {
	displayNameToKey[prop.term.toLowerCase()] = prop.key;
}

// Add mappings from defaults keys (they are already canonical)
for (const key of Object.keys(defaults)) {
	// Also map the key itself as a display name variant
	const displayName = key.replace(/_/g, ' ').toLowerCase();
	if (!displayNameToKey[displayName]) {
		displayNameToKey[displayName] = key;
	}
}

// Map specific display names that don't auto-match
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
	'urea': 'urea',
	'sodium': 'sodium',
	'na': 'sodium',
	'potassium': 'potassium',
	'k': 'potassium',
	'chloride': 'chloride',
	'cl': 'chloride',
	'magnesium': 'magnesium',
	'mg': 'magnesium',
	'iron': 'iron',
	'fe': 'iron',
	'ferritin': 'ferritin',
	'bilirubin': 'bilirubin',
	'alt': 'alt',
	'ast': 'ast',
	'ggt': 'ggt',
	'alp': 'alp',
	'total protein': 'total_protein',
	'albumin': 'albumin',
	'cholesterol': 'cholesterol',
	'hdl': 'hdl_cholesterol',
	'hdl cholesterol': 'hdl_cholesterol',
	'ldl': 'ldl_cholesterol',
	'ldl cholesterol': 'ldl_cholesterol',
	'non-hdl cholesterol': 'non_hdl_cholesterol',
	'triglycerides': 'triglycerides',
	'vitamin d': 'vitamin_d',
	'glucose': 'glucose',
	'blood sugar': 'blood_sugar',
	'wbc': 'white_blood_cells',
	'white blood cells': 'white_blood_cells',
	'rbc': 'red_blood_cells',
	'red blood cells': 'red_blood_cells',
	'hemoglobin': 'hemoglobin',
	'hb': 'hemoglobin',
	'hematocrit': 'hematocrit',
	'hct': 'hematocrit',
	'mcv': 'mcv',
	'mchc': 'mchc',
	'mch': 'mch',
	'platelets': 'platelets',
	'plt': 'platelets',
	'rdw': 'rdw',
	'neutrophils': 'neutrophils',
	'neutrophils absolute': 'absolute_neutrophils',
	'lymphocytes': 'lymphocytes',
	'lymphocytes absolute': 'absolute_lymphocytes',
	'monocytes': 'monocytes',
	'monocytes absolute': 'absolute_monocytes',
	'eosinophils': 'eosinophils',
	'eosinophils absolute': 'absolute_eosinophils',
	'basophils': 'basophils',
	'basophils absolute': 'absolute_basophils',
	'crp': 'crp',
	'c-reactive protein': 'crp',
	'tsh': 'tsh',
	'ft4': 'ft4',
	'free t4': 'ft4',
	'protein': 'protein',
	'urobilinogen': 'urobilinogen',
	'ketones': 'ketones',
	'nitrites': 'nitrites',
	'specific gravity': 'specific_gravity',
	'total amylase': 'total_amylase',
	'esr': 'esr',
	'bacteria': 'bacteria',
	'mdrd-ureaalb': 'mdrd_ureaalb',
	'ph': 'ph',
	'egfr': 'egfr',
	'uric acid': 'uric_acid',
	'temperature': 'temperature',
	'preassure': 'systolic',
	'pulse': 'resting_heart_rate',
	'respiratory rate': 'respiratory_rate',
	'oxygen saturation': 'oxygen_saturation',
	'weight': 'weight',
	'height': 'height',
	'bmi': 'bmi',
	'body mass index': 'bmi',
	'waist circumference': 'waist_circumference',
	'hip circumference': 'hip_circumference',
	'waist-to-hip ratio': 'waist_to_hip_ratio',
	'waist-to-height ratio': 'waist_to_height_ratio',
	'body fat percentage': 'body_fat_percentage',
	'lean body mass': 'lean_body_mass',
	'fat mass': 'fat_mass',
	'systolic blood pressure': 'systolic',
	'diastolic blood pressure': 'diastolic',
	'heart rate': 'resting_heart_rate',
	'cardiac output': 'cardiac_output',
	'stroke volume': 'stroke_volume',
	'cardiac index': 'cardiac_index',
	'ejection fraction': 'ejection_fraction',
	'blood': 'blood_urine',
	'diff': 'white_blood_cells',
	'calcium': 'calcium',
	'ca': 'calcium',
	'phosphate': 'phosphate',
	'phosphorus': 'phosphate',
	'p': 'phosphate'
};

// Resolve a synonym's first element (display name) to a canonical key
function resolveDisplayName(displayName: string): string | null {
	const lower = displayName.toLowerCase().trim();
	return DISPLAY_NAME_OVERRIDES[lower] ?? displayNameToKey[lower] ?? null;
}

// =====================================================
// Assign categories
// =====================================================

const CATEGORY_MAP: Record<string, string> = {
	birthDate: 'demographic',
	age: 'demographic',
	biologicalSex: 'demographic',
	bloodType: 'demographic',
	height: 'body_measurement',
	weight: 'body_measurement',
	bmi: 'body_measurement',
	waist_circumference: 'body_measurement',
	hip_circumference: 'body_measurement',
	waist_to_hip_ratio: 'body_measurement',
	waist_to_height_ratio: 'body_measurement',
	body_fat_percentage: 'body_composition',
	lean_body_mass: 'body_composition',
	fat_mass: 'body_composition',
	temperature: 'vital',
	systolic: 'vital',
	diastolic: 'vital',
	heart_rate: 'vital',
	resting_heart_rate: 'vital',
	heart_rate_variability: 'vital',
	respiratory_rate: 'vital',
	oxygen_saturation: 'vital',
	blood_sugar: 'vital',
	urea: 'kidney',
	creatinine: 'kidney',
	uric_acid: 'kidney',
	egfr: 'kidney',
	mdrd_ureaalb: 'kidney',
	sodium: 'electrolyte',
	potassium: 'electrolyte',
	chloride: 'electrolyte',
	magnesium: 'electrolyte',
	calcium: 'electrolyte',
	phosphate: 'electrolyte',
	iron: 'mineral',
	ferritin: 'mineral',
	bilirubin: 'liver',
	alt: 'liver',
	ast: 'liver',
	ggt: 'liver',
	alp: 'liver',
	total_protein: 'protein',
	albumin: 'protein',
	protein: 'protein',
	cholesterol: 'lipid',
	hdl_cholesterol: 'lipid',
	ldl_cholesterol: 'lipid',
	non_hdl_cholesterol: 'lipid',
	triglycerides: 'lipid',
	glucose: 'metabolic',
	vitamin_d: 'vitamin',
	white_blood_cells: 'hematology',
	red_blood_cells: 'hematology',
	hemoglobin: 'hematology',
	hematocrit: 'hematology',
	mcv: 'hematology',
	mchc: 'hematology',
	mch: 'hematology',
	platelets: 'hematology',
	rdw: 'hematology',
	neutrophils: 'hematology',
	lymphocytes: 'hematology',
	monocytes: 'hematology',
	eosinophils: 'hematology',
	basophils: 'hematology',
	absolute_neutrophils: 'hematology',
	absolute_lymphocytes: 'hematology',
	absolute_monocytes: 'hematology',
	absolute_eosinophils: 'hematology',
	absolute_basophils: 'hematology',
	crp: 'inflammation',
	esr: 'inflammation',
	tsh: 'thyroid',
	ft4: 'thyroid',
	glucose_urine: 'urinalysis',
	blood_urine: 'urinalysis',
	ketones: 'urinalysis',
	ketones_urine: 'urinalysis',
	nitrites: 'urinalysis',
	specific_gravity: 'urinalysis',
	urobilinogen: 'urinalysis',
	ph: 'urinalysis',
	bacteria: 'urinalysis',
	total_amylase: 'pancreatic'
};

// =====================================================
// Build catalog
// =====================================================

interface CatalogEntry {
	displayName: string;
	category: string;
	type: string;
	unit?: string;
	referenceRange: any[];
	valueExpirationInDays?: number;
	description?: string;
	lowInterpretation?: string;
	highInterpretation?: string;
	links?: string[];
	loincCodes?: string[];
	healthKitType?: string;
	synonyms: string[];
	localize?: boolean;
	options?: string[];
	signal?: string;
}

const catalog: Record<string, CatalogEntry> = {};

// 1. Start from defaults (the authoritative source for all keys)
for (const [key, def] of Object.entries(defaults)) {
	const entry: CatalogEntry = {
		displayName: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
		category: CATEGORY_MAP[key] ?? 'other',
		type: def.type ?? 'number',
		referenceRange: def.referenceRange ?? [],
		synonyms: []
	};

	if (def.unit) entry.unit = def.unit;
	if (def.valueExpirationInDays != null) entry.valueExpirationInDays = def.valueExpirationInDays;
	if (def.localize) entry.localize = def.localize;
	if (def.options) entry.options = def.options;
	if (def.signal) entry.signal = def.signal;

	catalog[key] = entry;
}

// 2. Merge lab.properties.json (descriptions, interpretations, links)
for (const prop of properties) {
	const entry = catalog[prop.key];
	if (!entry) {
		console.warn(`⚠️  lab.properties.json key "${prop.key}" not found in defaults — skipping`);
		continue;
	}
	// Use the display term from properties if available
	entry.displayName = prop.term;
	if (prop.description) entry.description = prop.description;
	if (prop.low) entry.lowInterpretation = prop.low;
	if (prop.high) entry.highInterpretation = prop.high;
	if (prop.links && prop.links.length > 0) entry.links = prop.links;
}

// 3. Merge synonyms from lab.synonyms.json
for (const group of synonymArrays) {
	if (group.length === 0) continue;
	const displayName = group[0].trim();
	const canonicalKey = resolveDisplayName(displayName);
	if (!canonicalKey || !catalog[canonicalKey]) {
		// Only warn for lab-like entries, not generic vitals with single entries
		if (group.length > 1) {
			console.warn(
				`⚠️  lab.synonyms.json group "${displayName}" couldn't resolve to a key — skipping`
			);
		}
		continue;
	}

	const entry = catalog[canonicalKey];
	// Add all non-canonical names as synonyms (skip first if it matches display name)
	for (const syn of group) {
		const trimmed = syn.trim();
		if (trimmed && !entry.synonyms.includes(trimmed)) {
			entry.synonyms.push(trimmed);
		}
	}
}

// 4. Merge SIGNAL_ALIASES from normalize.ts
for (const [alias, key] of Object.entries(SIGNAL_ALIASES)) {
	const entry = catalog[key];
	if (!entry) continue;
	if (!entry.synonyms.includes(alias)) {
		entry.synonyms.push(alias);
	}
}

// 5. Add HealthKit types
for (const [signal, hkType] of Object.entries(signalToHealthKit)) {
	const entry = catalog[signal];
	if (entry) {
		entry.healthKitType = hkType;
	}
}

// 6. Add LOINC codes
for (const [signal, codes] of Object.entries(LOINC_CODES)) {
	const entry = catalog[signal];
	if (entry) {
		entry.loincCodes = codes;
	}
}

// 7. Clean up synonyms — remove the canonical key itself and its display name from synonyms
for (const [key, entry] of Object.entries(catalog)) {
	entry.synonyms = entry.synonyms.filter(
		(s) => s.toLowerCase() !== key.toLowerCase() && s.toLowerCase() !== entry.displayName.toLowerCase()
	);
	// Deduplicate (case-insensitive)
	const seen = new Set<string>();
	entry.synonyms = entry.synonyms.filter((s) => {
		const lower = s.toLowerCase();
		if (seen.has(lower)) return false;
		seen.add(lower);
		return true;
	});
	// Remove empty synonyms
	entry.synonyms = entry.synonyms.filter((s) => s.length > 0);
}

// =====================================================
// Write output
// =====================================================

const output = JSON.stringify(catalog, null, 2);
const outputPath = resolve(DATA_DIR, 'signal-catalog.json');
writeFileSync(outputPath, output + '\n', 'utf-8');

// Stats
const keyCount = Object.keys(catalog).length;
const withDescription = Object.values(catalog).filter((e) => e.description).length;
const withLoinc = Object.values(catalog).filter((e) => e.loincCodes?.length).length;
const withSynonyms = Object.values(catalog).filter((e) => e.synonyms.length > 0).length;
const withHealthKit = Object.values(catalog).filter((e) => e.healthKitType).length;
const totalSynonyms = Object.values(catalog).reduce((sum, e) => sum + e.synonyms.length, 0);

console.log(`\n✅ Signal catalog written to ${outputPath}`);
console.log(`   Keys: ${keyCount}`);
console.log(`   With descriptions: ${withDescription}`);
console.log(`   With LOINC codes: ${withLoinc}`);
console.log(`   With synonyms: ${withSynonyms} (${totalSynonyms} total synonyms)`);
console.log(`   With HealthKit mapping: ${withHealthKit}`);
