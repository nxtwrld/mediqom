import lab from "./lab.properties.json";
import defaults from "./lab.properties.defaults.json";
//import vital from './vital.properties.json';
//import type { SelectOptions } from '$components/forms/Select.svelte';
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

//export const properties: Property[] = [...lab, ...vital].sort((a, b) => a.term.localeCompare(b.term));

//export default properties;

//export const propertyOptions: SelectOptions = properties.map(p => ({ key: p.key, value: p.term }));
/*
export let propertyByKeys: { [key: string]: Property } = properties.reduce((acc, p) => {
    acc[p.key] = p;
    return acc;
}, {} as { [key: string]: Property });

// list all properties keyed by loinc code or key if no loinc code is defined
export const propertyByLoinc:  { [key: string]: Property } = properties.reduce((acc, p) => {
    if (p.loinc_code && p.loinc_code != 'unknown') acc[p.loinc_code] = p;
    else acc[p.key] = p;
    return acc;
}, {} as { [key: string]: Property });

*/
export const getRangeByProfile = (
  property: string,
  profile: Profile,
): [number, number] => {
  const p = (defaults as Record<string, any>)[property];
  if (!p) return [0, 0];

  //const range = p.referenceRange.find(r => {});
  return [0, 0];
};

export function computeOutputForRereference(
  value: number,
  [refMin, refMax]: [number, number],
  [outMin, outMax]: [number, number],
): number {
  const halfRange = (refMax - refMin) / 2;
  const lowerBound = refMin - halfRange;
  const upperBound = refMax + halfRange;

  //console.log('value', value, 'refMin', refMin, 'refMax', refMax, 'outMin', outMin, 'outMax', outMax)

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
