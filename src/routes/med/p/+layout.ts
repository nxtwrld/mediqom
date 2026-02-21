import type { LayoutLoad } from "./$types";

export const prerender = false;

export const load: LayoutLoad = (async ({ parent }) => {
  await parent();
  return {};
}) satisfies LayoutLoad;
