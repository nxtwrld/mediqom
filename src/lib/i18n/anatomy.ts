/**
 * Translates anatomy object names from 3D model identifiers to human-readable localized names.
 * Handles L_/R_ side prefixes, trailing underscores, and falls back to humanized names.
 *
 * @param name - The raw object name from the 3D model (e.g., "L_gastrocnemius_lateral_head")
 * @param $t - The svelte-i18n translation function (pass $t from component context)
 * @returns Localized human-readable name (e.g., "Gastrocnemius (lateral head) (Left)")
 */
export function translateAnatomy(
  name: string,
  $t: (key: string) => string,
): string {
  // Try exact match first
  const exactKey = `anatomy.${name}`;
  const exactTranslation = $t(exactKey);
  if (exactTranslation !== exactKey) return exactTranslation;

  let side = "";
  let baseName = name;

  // Strip L_ or R_ prefix
  if (baseName.startsWith("L_")) {
    side = $t("anatomy.side.left");
    baseName = baseName.substring(2);
  } else if (baseName.startsWith("R_")) {
    side = $t("anatomy.side.right");
    baseName = baseName.substring(2);
  }

  // Strip trailing underscores
  baseName = baseName.replace(/_+$/, "");

  // Try base name translation
  const baseKey = `anatomy.${baseName}`;
  let translation = $t(baseKey);

  if (translation === baseKey) {
    // No translation found - humanize: replace underscores with spaces, capitalize first letter
    translation = baseName
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  return side ? `${translation} (${side})` : translation;
}
