import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { log } from "$lib/logging/logger";

export const load: LayoutServerLoad = async ({
  locals: { session, user },
}) => {

  // The auth guard in hooks should have already redirected unauthenticated users
  if (!session) {
    log.api.error("[Med] No session found - redirecting to auth");
    redirect(303, "/auth");
  }

  log.api.info("[Med] Loading for user:", user?.email);

  /*
  log.api.debug('loading.user...')
  const user = await loadUser(supabase);
  

  if (!user) {
    redirect(303, '/account')
  }
  if (user.subscription == 'individual') {
    redirect(303, '/med/p/'+user.id)
  }
*/

  return { session };
};
