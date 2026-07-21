/**
 * Server-only invite quota configuration
 */
import { env } from "$env/dynamic/private";

export function getMaxInvitesPerUser(): number {
  const parsed = parseInt(env.MAX_INVITES_PER_USER ?? "", 10);
  return isNaN(parsed) ? 4 : Math.max(0, parsed);
}
