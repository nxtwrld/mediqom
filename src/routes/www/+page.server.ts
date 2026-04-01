import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ request }) => {
  // Detect user's preferred language from Accept-Language header
  let detectedLang = "en"; // default

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const lang = acceptLanguage.toLowerCase();
    if (lang.includes("cs")) {
      detectedLang = "cs";
    } else if (lang.includes("de")) {
      detectedLang = "de";
    }
  }

  // Redirect to the detected language
  throw redirect(307, `/www/${detectedLang}`);
};
