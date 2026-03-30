# Custom Import Flow Checklist

When creating or reviewing a custom LangGraph import flow (i.e. one that does NOT extend `BaseProcessingNode`), verify it follows all standard patterns. Use `src/lib/langgraph/nodes/_base-processing-node.ts` as the canonical reference.

## 1. Required Enum Population

Schemas with empty `enum: []` arrays must be populated at runtime:

- **bodyParts** → populate from `$data/objects.json` (anatomy 3D model identifiers)
- **signals** → populate from `getCatalog()` in `$lib/focused.ts`

```typescript
import anatomyObjects from "$data/objects.json";
// After loading schema:
const schemaItems = schema?.parameters?.properties?.bodyParts?.items?.properties?.identification;
if (schemaItems?.enum && schemaItems.enum.length === 0) {
  const validObjects = Object.values(anatomyObjects).flatMap((cat: any) => cat.objects || []);
  schemaItems.enum = [...new Set(validObjects)];
}
```

## 2. Deterministic Confidence

Never use `Math.random()` for confidence scores. Always calculate based on data quality:

```typescript
function calculateConfidence(data: any): number {
  if (!data || Object.keys(data).length === 0) return 0;
  // Count how many key fields are present and meaningful
  const checks = [hasField1, hasField2, hasField3, hasField4];
  const count = checks.filter(Boolean).length;
  if (count >= 3) return 0.9;
  if (count >= 1) return 0.7;
  return 0.5;
}
```

## 3. Structured Logging

- **Use** `log.analysis.debug()`, `log.analysis.error()` from `$lib/logging/logger`
- **Never** use `console.log` or `console.error`
- **Never** dump raw patient data, DICOM metadata, or AI responses to logs
- Log only summary metrics: counts, boolean flags, field names — not values

Bad:
```typescript
console.log("🔍 COMPLETE STATE:", JSON.stringify(state.metadata, null, 2));
```

Good:
```typescript
log.analysis.debug("Detection starting", { hasMetadata: !!state.metadata, keyCount: Object.keys(state.metadata || {}).length });
```

## 4. Replay Mode

Every custom flow must respect replay mode. This can be handled at either:
- **Node level**: check `isReplayMode()` and return cached data
- **Workflow level**: check before invoking nodes (preferred for custom workflows)

Verify replay is handled somewhere in the call chain.

## 5. Schema Loading

Use the `$lib/` alias conversion pattern. Always check for default export:

```typescript
const schemaModule = await import("../../configurations/my-schema");
const schema = schemaModule.default;
if (!schema) throw new Error("Schema module does not export a default export");
```

## 6. Error Handling

- Catch errors and return them in the `errors` array on state
- Record failed workflow steps via `recordWorkflowStep()`
- Use `log.analysis.error()` — not `console.error`

## 7. Quick Review Checklist

- [ ] No `Math.random()` for confidence
- [ ] No `console.log` / `console.error` — only `log.analysis.*`
- [ ] No raw patient data in logs (names, IDs, birth dates, metadata dumps)
- [ ] bodyParts enum populated from `$data/objects.json`
- [ ] signals enum populated from `getCatalog()` (if schema has signals)
- [ ] Replay mode handled (node or workflow level)
- [ ] Schema loaded with default export check
- [ ] Errors returned on state.errors array
- [ ] `recordWorkflowStep()` called for both success and failure
- [ ] Token usage tracked and returned

## Reference Files

- `src/lib/langgraph/nodes/_base-processing-node.ts` — canonical base class
- `src/lib/langgraph/nodes/medical-imaging-analysis.ts` — custom flow example (DICOM)
- `src/lib/langgraph/nodes/patient-performer-detection.ts` — custom flow example (DICOM)
- `src/lib/langgraph/medical-imaging-workflow.ts` — workflow-level replay handling
- `$data/objects.json` — anatomy object identifiers for bodyParts enum
- `$lib/focused.ts` — `getCatalog()` for signals enum
