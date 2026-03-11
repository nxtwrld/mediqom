import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent, url }) => {
  await parent();

  const searchParams = new URLSearchParams(url.search);
  const raw = searchParams.get("tags") || "";
  const tags = raw ? raw.split(",").map(t => t.trim()).filter(Boolean) : [];

  return {
    filters: {
      tags,
    },
  };
};
