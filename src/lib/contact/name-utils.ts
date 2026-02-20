import type { VCard } from "./types.d";

/**
 * Reconstructs vcard.fn from structured name components
 * Format: [Prefix] GivenName [MiddleName] FamilyName [Suffix]
 *
 * Follows vCard 3.0 RFC 2426 standard for formatted name (FN) field.
 *
 * @param n - VCard.n structured name object
 * @returns Formatted full name string
 *
 * @example
 * reconstructFullName({
 *   honorificPrefix: 'Dr.',
 *   givenName: 'Jane',
 *   additionalName: 'Q',
 *   familyName: 'Doe',
 *   honorificSufix: 'Jr.'
 * })
 * // Returns: "Dr. Jane Q Doe Jr."
 */
export function reconstructFullName(n?: VCard["n"]): string {
  if (!n) return "";

  const parts: string[] = [];

  // Add components in standard order, filtering empty strings
  if (n.honorificPrefix?.trim()) parts.push(n.honorificPrefix.trim());
  if (n.givenName?.trim()) parts.push(n.givenName.trim());
  if (n.additionalName?.trim()) parts.push(n.additionalName.trim());
  if (n.familyName?.trim()) parts.push(n.familyName.trim());
  if (n.honorificSufix?.trim()) parts.push(n.honorificSufix.trim()); // Note: typo exists in schema

  return parts.join(" ");
}

/**
 * Checks if any name components exist (used to determine if reconstruction is meaningful)
 *
 * @param n - VCard.n structured name object
 * @returns True if any name component has a non-empty value
 */
export function hasNameComponents(n?: VCard["n"]): boolean {
  if (!n) return false;

  return !!(
    n.givenName?.trim() ||
    n.familyName?.trim() ||
    n.additionalName?.trim() ||
    n.honorificPrefix?.trim() ||
    n.honorificSufix?.trim()
  );
}
