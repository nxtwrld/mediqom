/**
 * Schema enum population — single source of truth.
 *
 * Some extraction schemas declare `enum: []` as a placeholder because the
 * canonical values live elsewhere (3D anatomy registry, runtime signal
 * catalog). This helper walks any JSON Schema and fills the known slots
 * consistently, so every node populates the same enums in the same way.
 *
 * Idempotent: enums that already carry values are left untouched.
 *
 * Known slots:
 *   - `properties.identification.enum` ← 3D anatomy mesh names (objects.json)
 *   - `properties.signal.enum`         ← lab signal catalog keys
 */

import anatomyObjects from "$data/objects.json";
import { getCatalog } from "$data/signal-catalog";
import { STATIC_PROPERTIES } from "$lib/health/property-categories";
import { log } from "$lib/logging/logger";

const ANATOMY_ENUM: readonly string[] = Object.freeze([
  ...new Set(
    Object.values(anatomyObjects).flatMap(
      (category: any) => category.objects || [],
    ),
  ),
]);

function getSignalEnum(): readonly string[] {
  return Object.keys(getCatalog()).filter(
    (key) => !STATIC_PROPERTIES.includes(key),
  );
}

const ENUM_SLOTS: Record<string, () => readonly string[]> = {
  identification: () => ANATOMY_ENUM,
  signal: getSignalEnum,
};

export function populateSchemaEnums(schema: unknown): void {
  if (!schema || typeof schema !== "object") return;
  walk(schema as Record<string, unknown>, new WeakSet());
}

function walk(node: Record<string, unknown>, seen: WeakSet<object>): void {
  if (seen.has(node)) return;
  seen.add(node);

  const props = node.properties as Record<string, any> | undefined;
  if (props && typeof props === "object") {
    for (const [propName, getValues] of Object.entries(ENUM_SLOTS)) {
      const target = props[propName];
      if (
        target &&
        typeof target === "object" &&
        Array.isArray(target.enum) &&
        target.enum.length === 0
      ) {
        target.enum = [...getValues()];
        log.analysis.debug(`Populated ${propName} enum`, {
          count: target.enum.length,
        });
      }
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          walk(item as Record<string, unknown>, seen);
        }
      }
    } else if (value && typeof value === "object") {
      walk(value as Record<string, unknown>, seen);
    }
  }
}
