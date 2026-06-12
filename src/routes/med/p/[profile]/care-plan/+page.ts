import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent, url }) => {
  await parent();
  const region = new URLSearchParams(url.search).get("region") || null;
  return { region };
};
