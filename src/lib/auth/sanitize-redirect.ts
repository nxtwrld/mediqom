/**
 * Sanitize redirect paths to prevent open redirect attacks.
 * Only allows relative paths starting with `/` (not protocol-relative `//`).
 * Returns `/med` as safe default for any suspicious input.
 */
export function sanitizeRedirect(value: string | null | undefined): string {
  if (!value) return "/med";
  if (!value.startsWith("/")) return "/med";
  if (value.startsWith("//")) return "/med";
  if (value.includes("://")) return "/med";
  return value;
}
