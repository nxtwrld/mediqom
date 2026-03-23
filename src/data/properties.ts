import { getCatalog } from "./signal-catalog";
import type { Profile } from "$lib/types.d";

export type Property = {
  key: string;
  term: string;
  loinc_code?: string;
  units?: string;
  type?: string;
  description?: string;
  category?: string;
  system?: string;
  high?: string;
  low?: string;
  links?: string[];
};

export const getRangeByProfile = (
  property: string,
  profile: Profile,
): [number, number] => {
  const catalog = getCatalog();
  const entry = catalog[property];
  if (!entry?.referenceRange?.length) return [0, 0];

  // Profile stores age/sex in the health object or via signals
  const age = profile.health?.signals?.age?.[0]?.value as number | undefined;
  const sex = (profile.health?.signals?.biologicalSex?.[0]?.value as string)?.toLowerCase() ?? 'any';

  // Find matching range
  let match = entry.referenceRange.find(
    (r) =>
      (r.sex === sex || r.sex === 'any') &&
      age != null &&
      age >= r.ageRange.min &&
      age < r.ageRange.max
  );

  if (!match) {
    match = entry.referenceRange.find(
      (r) => r.sex === 'any' && r.ageRange.min >= 18
    );
  }

  if (!match) {
    match = entry.referenceRange[0];
  }

  if (!match) return [0, 0];
  const low = typeof match.low === 'number' ? match.low : 0;
  const high = typeof match.high === 'number' ? match.high : 0;
  return [low, high];
};

export function computeOutputForRereference(
  value: number,
  [refMin, refMax]: [number, number],
  [outMin, outMax]: [number, number],
): number {
  const halfRange = (refMax - refMin) / 2;
  const lowerBound = refMin - halfRange;
  const upperBound = refMax + halfRange;

  if (value >= refMin && value <= refMax) {
    // Value is within the reference range
    return outMax;
  } else if (value >= lowerBound && value < refMin) {
    // Value is below the reference range
    const t = (value - lowerBound) / halfRange;
    return outMin + t * (outMax - outMin);
  } else if (value > refMax && value <= upperBound) {
    // Value is above the reference range
    const t = (value - refMax) / halfRange;
    return outMax - t * (outMax - outMin);
  } else {
    // Value is outside the extended reference range
    return outMin;
  }
}
