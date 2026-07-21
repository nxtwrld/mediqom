/**
 * Namespaced tag auto-generation from document content.
 *
 * Namespace registry:
 *   body:   – bodyParts identification
 *   signal: – lab tests / vital signs
 *   dx:     – ICD-10 diagnosis codes
 *   med:    – medications
 *   proc:   – procedures
 *   img:    – imaging modality
 *   allergy: – allergens
 *   imm:    – immunizations
 *   spec:   – specimen types
 *   perf:   – performer specialty
 *   gene:   – genetic variants (case-sensitive)
 *   bio:    – biomarkers
 *   echo:   – echo study types
 *   ecg:    – ECG rhythms
 *   rec:    – recommendation categories
 */

export function generateNamespacedTags(content: Record<string, any>): string[] {
	const tags: string[] = [];

	// Body parts: body:
	if (Array.isArray(content.bodyParts)) {
		for (const bp of content.bodyParts) {
			if (typeof bp.identification === 'string' && bp.identification.length > 0) {
				tags.push(`body:${bp.identification}`);
			}
		}
	}

	// Signals: signal:
	const signals = Array.isArray(content.signals)
		? content.signals
		: Array.isArray(content.signals?.signals)
			? content.signals.signals
			: [];
	for (const s of signals) {
		const name = s.signal || s.test;
		if (typeof name === 'string' && name.length > 0) {
			tags.push(`signal:${name.toLowerCase()}`);
		}
	}

	// Diagnosis: dx:
	if (Array.isArray(content.diagnosis)) {
		for (const d of content.diagnosis) {
			if (typeof d.code === 'string' && d.code.length > 0) {
				tags.push(`dx:${d.code}`);
			}
		}
	}

	// Medications: med:
	const meds = content.prescription?.medications || content.medications || [];
	if (Array.isArray(meds)) {
		for (const m of meds) {
			if (typeof m.name === 'string' && m.name.length > 0) {
				tags.push(`med:${m.name.toLowerCase()}`);
			}
		}
	}

	// Procedures: proc:
	if (Array.isArray(content.procedures)) {
		for (const p of content.procedures) {
			if (typeof p.name === 'string' && p.name.length > 0) {
				tags.push(`proc:${p.name.toLowerCase()}`);
			}
		}
	}

	// Imaging: img:
	if (typeof content.imaging?.imagingCategory === 'string') {
		tags.push(`img:${content.imaging.imagingCategory.toLowerCase()}`);
	}

	// Allergies: allergy:
	if (Array.isArray(content.allergies)) {
		for (const a of content.allergies) {
			if (typeof a.allergen === 'string' && a.allergen.length > 0) {
				tags.push(`allergy:${a.allergen.toLowerCase()}`);
			}
		}
	}

	// Immunizations: imm:
	const immunizations = Array.isArray(content.immunizations)
		? content.immunizations
		: content.immunization
			? [content.immunization]
			: [];
	for (const i of immunizations) {
		if (typeof i.name === 'string' && i.name.length > 0) {
			tags.push(`imm:${i.name.toLowerCase()}`);
		}
	}

	// Specimens: spec:
	if (Array.isArray(content.specimens)) {
		for (const s of content.specimens) {
			if (typeof s.specimenType === 'string' && s.specimenType.length > 0) {
				tags.push(`spec:${s.specimenType.toLowerCase()}`);
			}
		}
	}

	// Performer: perf:
	if (Array.isArray(content.performer)) {
		for (const p of content.performer) {
			if (typeof p.specialty === 'string' && p.specialty.length > 0) {
				tags.push(`perf:${p.specialty.toLowerCase()}`);
			}
		}
	}

	// Molecular: gene: and bio:
	if (content.molecular) {
		if (Array.isArray(content.molecular.geneticVariants)) {
			for (const v of content.molecular.geneticVariants) {
				if (typeof v.gene === 'string' && v.gene.length > 0) {
					tags.push(`gene:${v.gene}`); // case-sensitive (HGNC symbols)
				}
			}
		}
		if (Array.isArray(content.molecular.biomarkers)) {
			for (const b of content.molecular.biomarkers) {
				if (typeof b.biomarker === 'string' && b.biomarker.length > 0) {
					tags.push(`bio:${b.biomarker}`);
				}
			}
		}
	}

	// Echo: echo:
	if (typeof content.echo?.studyType === 'string') {
		tags.push(`echo:${content.echo.studyType.toLowerCase()}`);
	}

	// ECG: ecg:
	if (typeof content.ecg?.rhythm?.primaryRhythm === 'string') {
		tags.push(`ecg:${content.ecg.rhythm.primaryRhythm.toLowerCase()}`);
	}

	// Recommendations: rec:
	if (Array.isArray(content.recommendations)) {
		for (const r of content.recommendations) {
			if (typeof r.category === 'string' && r.category.length > 0) {
				tags.push(`rec:${r.category.toLowerCase()}`);
			}
		}
	}

	return [...new Set(tags)];
}

/** Parse a tag into [namespace, value]. Returns [null, tag] for un-namespaced tags. */
export function parseTag(tag: string): [string | null, string] {
	const idx = tag.indexOf(':');
	if (idx > 0 && idx < tag.length - 1) {
		return [tag.substring(0, idx), tag.substring(idx + 1)];
	}
	return [null, tag];
}

/** Filter tags to a single namespace, returning only the values (without prefix). */
export function filterTagsByNamespace(tags: string[], namespace: string): string[] {
	const prefix = namespace + ':';
	return tags.filter((t) => t.startsWith(prefix)).map((t) => t.substring(prefix.length));
}

/** Return only non-namespaced (legacy) tags. */
export function getLegacyTags(tags: string[]): string[] {
	return tags.filter((t) => !t.includes(':'));
}
