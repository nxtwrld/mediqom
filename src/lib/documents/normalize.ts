import type { Document } from './types.d';

export function normalizeDocument(doc: Document): Document {
	const version = doc.metadata?.schemaVersion ?? 1;
	if (version === 1) return doc;
	throw new Error(`Unknown schemaVersion: ${version}`);
}
