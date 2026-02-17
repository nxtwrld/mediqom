import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { deleteUserStorage } from '$lib/storage/cleanup';

export const DELETE: RequestHandler = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Use service role client for storage cleanup (needs to read profile/documents)
		const serviceClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Clean up storage files (avatars, attachments) before deleting user
		await deleteUserStorage(user.id, serviceClient);

		// Delete auth user - database cascades handle all related data automatically
		const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

		if (deleteError) {
			console.error('[User Delete] Failed to delete auth user:', deleteError);
			return json({ success: false, error: 'Failed to delete account' }, { status: 500 });
		}

		return json({ success: true, message: 'Account deleted successfully' });
	} catch (error) {
		console.error('[User Delete] Unexpected error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
