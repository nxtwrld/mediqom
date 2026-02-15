import { getClient } from '$lib/supabase'
import { clearAllJobKeys } from '$lib/import/encryption'

async function logout() {
	// Clear all ephemeral import job encryption keys
	await clearAllJobKeys()

	const supabase = getClient()
	// No need to check if user exists - just sign out
	return await supabase?.auth.signOut()
}

const auth = {
  logout: () => {
    return logout();
  },
};

export default auth;
