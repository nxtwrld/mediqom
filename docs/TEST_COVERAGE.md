# Test Coverage

## Scope

Coverage is measured on `src/lib/**` only. Svelte components, API routes, and the following directories are excluded from the metric because they are either declarative data, external-API-bound, or better covered by Playwright E2E:

- `src/lib/configurations/` — 54 declarative JSON-schema configs
- `src/lib/prompts/` — static prompt data
- `src/lib/audio/` — external audio APIs
- `src/lib/capacitor/` — native platform adapters
- `src/lib/langgraph/nodes/` — LLM-bound; covered by Playwright import flow
- `src/lib/debug/`, `src/lib/logging/`, `src/lib/i18n/`
- `src/lib/**/*.d.ts`, `src/lib/**/types.ts`, `src/lib/**/index.ts` (re-export barrels)

## Target

**Final:** `lines: 80, functions: 75, branches: 70, statements: 80`

## Baseline (2026-04-14)

| Metric     | % |
|------------|-------|
| Lines      | 7.94% |
| Functions  | 6.90% |
| Branches   | 7.87% |
| Statements | 7.80% |

- Test files: 25
- Tests: 451 (all passing)
- Duration: 6.87s

## Current (2026-04-17, after Step 2 partial)

| Metric     | % |
|------------|-------|
| Lines      | 20.69% |
| Functions  | 20.26% |
| Branches   | 18.09% |
| Statements | 20.43% |

- Test files: 73 (+48 from baseline)
- Tests: 1098 (+647 from baseline, all passing)

## Ratchet History

Thresholds in `vite.config.ts` (`test.coverage.thresholds`) are set to roughly `baseline - 2%` to prevent regressions. Raise after each sprint as coverage grows.

| Date       | Lines | Functions | Branches | Statements | Note |
|------------|-------|-----------|----------|------------|------|
| 2026-04-14 | 5     | 4         | 5        | 5          | Initial floor after baseline (7.94% lines). |
| 2026-04-14 | 8     | 7         | 8        | 8          | Step 1 partial: 19 quick-win test files (auth, strings, datetime, array, object, health, context, languages, signals, medications, chat, utils, encryption, shortcuts, i18n-server). Lifted lines 7.94% → 9.9%. |
| 2026-04-15 | 13    | 12        | 12       | 13         | Step 1+2: 28 more test files (output-guard, token-optimization, data-extractors, security-context-builder, security-audit, assessInputs, anatomy-integration, feature-flags, audit, dynamic-layout-engine, migration, arrays, images, ui, normalize, relationship-engine, dynamic-registry). Lines 9.9% → 15.44%. |
| 2026-04-17 | 18    | 18        | 16       | 18         | Step 2 continued: context-composer, session-data-utils, constants, qom-event-processor, qom-transformer, client-tool-executor, multilingual-patterns, quantile-bands, progress-tracker, storage/cleanup, mcp-tool-wrapper, theme/store. Lines 15.44% → 20.69%. |

## How to Run Locally

```bash
npm run test:coverage
```

Reports:
- Console: `text` + `text-summary`
- HTML: `coverage/index.html`
- Machine-readable: `coverage/coverage-summary.json`, `coverage/lcov.info`

## CI

`.github/workflows/test.yml` runs `npm run test:coverage` on every PR and push, uploads the `coverage/` directory as a build artifact, and fails the job if thresholds regress.

## Sprint Plan

1. **Step 1 — Quick wins.** Pure-logic utilities (strings, datetime, array, object, common.utils, auth helpers, audit logger, encryption/utils, context/objects). Target ~60% lines.
2. **Step 2 — Core logic.** Chat (input-sanitizer, emergency-detector, tool-executor, chat-manager), context composer + token optimizer, import.server analyzeReport, LangGraph factories. Target ~72% lines.
3. **Step 3 — Security + complex.** Encryption failure modes, billing (Stripe webhook verification, RevenueCat), share flow, session manager pure transitions, QOM helpers. Target 80% lines.
4. **Step 4 — Playwright expansion.** E2E flows for auth, share, chat SSE, session, profile. Separate CI job.

After each step, update the ratchet history above and raise thresholds in `vite.config.ts` to the new baseline − 2%.
