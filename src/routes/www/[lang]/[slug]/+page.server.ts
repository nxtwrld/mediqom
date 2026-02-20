import type { EntryGenerator, PageServerLoad } from "./$types";
import { loadContent, listContent } from "$lib/content/loader.server";

export const prerender = true;

export const entries: EntryGenerator = async () => {
  const langs = ["en", "cs", "de"];
  const results: Array<{ lang: string; slug: string }> = [];

  for (const lang of langs) {
    const slugs = await listContent(lang);
    for (const slug of slugs) {
      results.push({ lang, slug });
    }
  }

  return results;
};

export const load: PageServerLoad = async ({ params }) => {
  const { lang, slug } = params;

  const content = await loadContent(lang, slug);

  return {
    content,
    slug,
    lang,
  };
};
