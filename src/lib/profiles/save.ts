import { updateDocument } from '$lib/documents';
import { profiles, updateProfile } from '$lib/profiles';
import type { Profile } from '$lib/types.d';
import type { Document } from '$lib/documents/types.d';
import { log } from '$lib/logging/logger';
import { reconstructFullName, hasNameComponents } from '$lib/contact/name-utils';
import { saveHealthProfile } from '$lib/health/save';
import { apiFetch } from '$lib/api/client';

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

interface SaveProfileChangesResult {
	success: boolean;
	error?: string;
}

/**
 * Orchestrates saving all changed profile sections (vcard, insurance, health, avatar).
 * Performs JSON-diff change detection and only persists what actually changed.
 */
export async function saveProfileChanges(
	editingProfile: any,
	originalProfile: any
): Promise<SaveProfileChangesResult> {
	if (!editingProfile?.id) {
		return { success: false, error: 'Missing profile id' };
	}

	const editingSnapshot = JSON.parse(JSON.stringify(editingProfile));
	const originalSnapshot = JSON.parse(JSON.stringify(originalProfile));

	const vcardChanged =
		JSON.stringify(editingSnapshot.vcard) !== JSON.stringify(originalSnapshot.vcard);
	const healthChanged =
		JSON.stringify(editingSnapshot.health) !== JSON.stringify(originalSnapshot.health);
	const insuranceChanged =
		JSON.stringify(editingSnapshot.insurance) !== JSON.stringify(originalSnapshot.insurance);

	const hasChanges = vcardChanged || healthChanged || insuranceChanged;

	if (!hasChanges) {
		profileLogger.info('No profile changes detected, skipping save', {
			profileId: editingProfile.id
		});
		return { success: true };
	}

	try {
		let mergedProfile = editingProfile;

		if (vcardChanged || insuranceChanged) {
			const profileResult = await saveProfileDocument({
				profileId: editingProfile.id,
				vcard: editingProfile.vcard,
				insurance: editingProfile.insurance
			});

			if (profileResult.success && profileResult.fullName) {
				try {
					const response = await apiFetch(`/v1/med/profiles/${editingProfile.id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ fullName: profileResult.fullName })
					});
					const updatedProfileData = await response.json();
					mergedProfile = { ...mergedProfile, ...updatedProfileData };
				} catch (e) {
					profileLogger.warn('Failed to sync fullName to database', {
						profileId: editingProfile.id,
						error: e
					});
				}
			}
		}

		if (healthChanged && editingProfile.health) {
			await saveHealthProfile({
				profileId: editingProfile.id,
				formData: editingProfile.health
			});
		}

		updateProfile(mergedProfile);
		profileLogger.info('Profile changes saved successfully', { profileId: editingProfile.id });
		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		profileLogger.error('Failed to save profile changes', {
			profileId: editingProfile.id,
			error: errorMessage
		});
		return { success: false, error: errorMessage };
	}
}

/**
 * Deep-copies a profile and prepares it for editing:
 * - Initialises health/vcard/insurance if absent
 * - Migrates legacy fullName → vcard.fn + vcard.n components (one-time)
 */
export function prepareProfileForEditing(profile: any): any {
	const snapshot = JSON.parse(JSON.stringify(profile));

	if (!snapshot.health) snapshot.health = {};
	if (!snapshot.vcard) snapshot.vcard = {};
	if (!snapshot.insurance) snapshot.insurance = { provider: '', number: '' };

	if (snapshot.fullName && (!snapshot.vcard.fn || snapshot.vcard.fn === '')) {
		snapshot.vcard.fn = snapshot.fullName;

		const nameParts = snapshot.fullName.trim().split(/\s+/);

		if (!snapshot.vcard.n) {
			snapshot.vcard.n = {
				honorificPrefix: '',
				givenName: '',
				additionalName: '',
				familyName: '',
				honorificSufix: ''
			};
		}

		let currentIndex = 0;
		if (nameParts[0] && nameParts[0].endsWith('.')) {
			snapshot.vcard.n.honorificPrefix = nameParts[0];
			currentIndex = 1;
		}

		if (nameParts.length - currentIndex === 1) {
			snapshot.vcard.n.familyName = nameParts[currentIndex] || '';
		} else if (nameParts.length - currentIndex === 2) {
			snapshot.vcard.n.givenName = nameParts[currentIndex] || '';
			snapshot.vcard.n.familyName = nameParts[currentIndex + 1] || '';
		} else if (nameParts.length - currentIndex >= 3) {
			snapshot.vcard.n.givenName = nameParts[currentIndex] || '';
			snapshot.vcard.n.familyName = nameParts[nameParts.length - 1] || '';
			snapshot.vcard.n.additionalName = nameParts
				.slice(currentIndex + 1, nameParts.length - 1)
				.join(' ');
		}
	}

	return snapshot;
}
