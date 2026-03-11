import type { LayoutServerLoad } from "./$types";
import { log } from "$lib/logging/logger";

export const load: LayoutServerLoad = async ({
  locals: { session, user },
  cookies,
  url,
}) => {
  try {
    return {
      session,
      user,
      cookies: cookies.getAll(),
    };
  } catch (error) {
    log.api.error(
      `[LAYOUT ERROR] Layout server load failed for ${url.pathname}:`,
      error,
    );
    throw error;
  }
};
