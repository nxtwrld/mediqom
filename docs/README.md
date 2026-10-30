# Mediqom Documentation

This is the index and status board for all project docs. Each doc starts with a status block, written as `> **Status:** … · **Type:** … · **Verified:** YYYY-MM-DD`, followed by what is built and what is pending. When you change code that a doc describes, update its status block and the matching row below.

Status values:

- **Implemented**: the doc describes code that exists.
- **Partial**: some of it is built.
- **Pending**: not built yet.
- **Obsolete**: kept for history; don't follow it.

Coding conventions live in [`../CLAUDE.md`](../CLAUDE.md), and design tokens in [`../DESIGN.md`](../DESIGN.md).

## Layout

| Folder                              | What goes there                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `architecture/`                     | How core systems work, plus cross-cutting design (AI, context, health data, import) |
| `features/`                         | Shipped or partly shipped features, with their remaining roadmap                    |
| `plans/`                            | Designs not built yet                                                               |
| `research/`                         | Evaluations and option analyses                                                     |
| `design/`                           | UX and layout strategy (tokens are in root `DESIGN.md`)                             |
| `security/`, `compliance/`          | Cryptography, security audit, NIS2                                                  |
| `guides/`, `testing/`, `marketing/` | How-tos, coverage policy, copy                                                      |
| `archive/`                          | Obsolete docs, each with a banner naming its replacement                            |

## Status board (verified 2026-10-21)

### Architecture

| Doc                                                           | Status                 | Notes                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AI Gateway](architecture/AI_GATEWAY.md)                      | Implemented (chat)     | AI SDK + Vercel AI Gateway. Only chat uses it. Import, session, Serenity, care-plan plain-language and `llm-output-guard` still go through LangChain. |
| [Context management](architecture/CONTEXT_MANAGEMENT.md)      | Implemented, with gaps | 7 MCP tools registered. Search is term-based; semantic/embedding search is not built.                                                                 |
| [Health data (meta-histories)](architecture/HEALTH_DATA.md)   | Partial                | Storage tiers and types built. Time-series queries and compression are stubs. HealthKit sync writes to legacy signals.                                |
| [Ontology](architecture/ONTOLOGY.md)                          | Partial                | SNOMED anatomy scaffold, with 343 of 465 codes empty. FHIR substrate pending.                                                                         |
| [Anatomy 3D textures](architecture/ANATOMY_3D_TEXTURES.md)    | Pending                | GLBs exist but have no textures. The loader is still OBJ/MTL.                                                                                         |
| [Import](architecture/import/IMPORT.md)                       | Implemented            | LangGraph workflow, SSE, resilient job-based import (`/v1/import/jobs`).                                                                              |
| [Import encryption](architecture/import/IMPORT_ENCRYPTION.md) | Implemented            | Encrypted job results; completed jobs have a 1h TTL.                                                                                                  |

### Features

| Doc                                                                                   | Status            | Notes                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| [Chat](features/chat/CHAT.md)                                                         | Partial           | Phase 1 safety layer built. Phases 2–4 pending. No consent module. `emergency_banner` has no client handler. |
| [Chat widgets](features/chat/WIDGETS.md)                                              | Implemented       | Allowlist registry. No Shadow DOM isolation.                                                                 |
| [Care plan](features/careplan/CAREPLAN.md) · [roadmap](features/careplan/ROADMAP.md)  | Partial           | v1 and multi-region highlighting built. Open: Care Team, sparklines, multi-profile, sharing, notifications.  |
| [Plugin: engineering](features/plugin/ENGINEERING.md) · [PRD](features/plugin/PRD.md) | Partial / Pending | Anatomy pipeline and `mcp-spike` built. No production `/v1/mcp`, widget bundle or P0 tools.                  |
| [Transcription](features/session/TRANSCRIPTION.md)                                    | Partial           | 17 of 44 checklist items. Deepgram diarization exists but is off by default.                                 |
| [Sharing](features/SHARING.md)                                                        | Implemented       | `document_shares` and the accept flow.                                                                       |
| [Billing](features/BILLING.md)                                                        | Implemented       | Stripe (web) and RevenueCat (mobile). `/iap/verify` is legacy.                                               |
| [Quantile bands](features/QUANTILE_BANDS.md)                                          | Implemented       | `src/lib/signals/quantile-bands.ts`                                                                          |
| [Access & referrals](features/ACCESS_AND_REFERRALS.md)                                | Partial           | Beta applications and invite codes built. Referral rewards pending.                                          |

### Plans (not built)

| Doc                                                     | Status                   | Notes                                                                                                                          |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [Session MoE / QOM](plans/SESSION_MOE.md)               | Partial (mostly pending) | **Live analysis runs through `src/lib/session-deprecated/`.** The QOM code only drives visualisation and simulation (6 of 22). |
| [Chat agents](plans/CHAT_AGENTS.md)                     | Pending                  | Agent personas, third-party services, consent.                                                                                 |
| [Context roadmap](plans/CONTEXT_ROADMAP.md)             | Partial                  | Phases 1–4 done. Phase 5 (document index) pending.                                                                             |
| [Conversation history](plans/CONVERSATION_HISTORY.md)   | Pending                  | Sessions are saved as documents instead.                                                                                       |
| [Profile matching](plans/PROFILE_MATCHING.md)           | Pending                  | `findInProfiles` is still basic.                                                                                               |
| [Research data sharing](plans/RESEARCH_DATA_SHARING.md) | Pending                  | 0 of 20.                                                                                                                       |
| [Ideas backlog](plans/IDEAS.md)                         | Pending                  | Scratch list.                                                                                                                  |

### Research, design, security, other

| Doc                                            | Status             | Notes                                                                    |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| [Models review](research/MODELS_REVIEW.md)     | Partial (outdated) | `models.yaml` is still on gpt-4o. Chat has moved to the gateway catalog. |
| [Responsive layout](design/RESPONSIVE.md)      | Implemented        | Living bar navigation: pages left, layers right, import in Documents.    |
| [Cryptography](security/CRYPTOGRAPHY.md)       | Implemented        | AES/RSA plus ML-KEM hybrid, passkey PRF, recovery key.                   |
| [Security report](security/SECURITY_REPORT.md) | Partial            | 24 fixed, 3 accepted, 2 partial (H-1, M-9), 2 open (H-9, M-8).           |
| [NIS2](compliance/NIS2.md)                     | Pending            | 0 of 12 technical items.                                                 |
| [Mobile auth](guides/MOBILE_AUTH.md)           | Implemented        | Deep links and the auth callback.                                        |
| [Test coverage](testing/TEST_COVERAGE.md)      | Partial            | Thresholds 24/24/24/20 in `vite.config.ts`.                              |
| [Taglines](marketing/TAGLINES.md)              | n/a                |                                                                          |

### Archive (obsolete, don't follow)

| Doc                                                                     | Superseded by                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [AI session analysis](archive/AI_SESSION_ANALYSIS.md)                   | [plans/SESSION_MOE.md](plans/SESSION_MOE.md)                                 |
| [AI import user configuration](archive/AI_IMPORT_USER_CONFIGURATION.md) | [architecture/import/IMPORT.md](architecture/import/IMPORT.md) (never built) |
| [AI TODO (import modernisation)](archive/AI_TODO.md)                    | [architecture/import/IMPORT.md](architecture/import/IMPORT.md)               |
| [Data & privacy](archive/DATA_AND_PRIVACY.md)                           | [security/CRYPTOGRAPHY.md](security/CRYPTOGRAPHY.md)                         |
