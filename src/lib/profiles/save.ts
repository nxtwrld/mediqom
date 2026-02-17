import { updateDocument } from '$lib/documents';
import { profiles, updateProfile } from '$lib/profiles';
import type { Profile } from '$lib/types.d';
import type { Document } from '$lib/documents/types.d';
import { log } from '$lib/logging/logger';
import { reconstructFullName, hasNameComponents } from '$lib/contact/name-utils';

const profileLogger = log.namespace('Profile', '👤');

interface SaveProfileDocumentOptions {
	profileId: string;
	vcard?: any;
	insurance?: any;
}

interface SaveProfileDocumentResult {
	success: boolean;
	fullName?: string; // Return extracted fullName for DB sync
	error?: string;
}

/**
 * Save profile document (vcard + insurance) to encrypted document
 * Returns fullName extracted from vcard.fn for database sync
 */
export async function saveProfileDocument(
	options: SaveProfileDocumentOptions
): Promise<SaveProfileDocumentResult> {
	const { profileId, vcard, insurance } = options;

	if (!profileId) {
		return { success: false, error: 'Missing profileId' };
	}

	try {
		// Get the profile to find profileDocumentId
		const profile = profiles.get(profileId) as Profile;
		if (!profile) {
			return { success: false, error: 'Profile not found' };
		}

		if (!profile.profileDocumentId) {
			return { success: false, error: 'Profile document not found' };
		}

		// Get the profile document
		const { getDocument } = await import('$lib/documents');
		const document = await getDocument(profile.profileDocumentId);

		if (!document) {
			return { success: false, error: 'Profile document not found in store' };
		}

		// Update document content
		if (vcard !== undefined) {
			// SAFETY NET: Always reconstruct fn from components if components exist
			// This handles cases where blur handlers didn't fire (imports, programmatic updates)
			if (hasNameComponents(vcard.n)) {
				const reconstructed = reconstructFullName(vcard.n);
				if (reconstructed) {
					vcard.fn = reconstructed;
					profileLogger.info('Reconstructed vcard.fn from components', {
						profileId,
						fn: vcard.fn
					});
				}
			}

			document.content.vcard = vcard;
		}
		if (insurance !== undefined) {
			document.content.insurance = insurance;
		}

		// Save to database
		await updateDocument(document);

		// Update the profile in the store with new data
		const updatedProfile = {
			...profile,
			vcard: document.content.vcard,
			insurance: document.content.insurance
		};
		updateProfile(updatedProfile);

		// Extract fullName from vcard.fn for database sync
		const fullName = document.content.vcard?.fn || profile.fullName || '';

		profileLogger.info('Profile document saved successfully', { profileId });
		return { success: true, fullName };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		profileLogger.error('Failed to save profile document', { profileId, error: errorMessage });
		return { success: false, error: errorMessage };
	}
}
