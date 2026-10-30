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
    // Set by the `overlay.import` listener in UI.svelte — import lives inline on this page
    importRequest: searchParams.has("import")
      ? {
          jobId: searchParams.get("job") || undefined,
          autoOpen: searchParams.get("autoOpen") === "1",
        }
      : null,
  };
};
