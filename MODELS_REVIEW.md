# AI Model Review — Mediqom

> Last updated: 2026-04-02. Model pricing changes frequently — verify before implementation.

## 1. Current State

### Import/Analysis Flows (`src/lib/config/models.yaml`)

| Flow | Provider | Model ID | Max Tokens | Vision |
|------|----------|----------|------------|--------|
| `ocr_extraction` | openai | `gpt-4o-2024-08-06` | 16384 | Yes |
| `extraction` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `medical_analysis` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `feature_detection` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `signal_processing` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `document_type_routing` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `quality_validation` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `serenity_form_analysis` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `ai_chat_patient` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |
| `ai_chat_clinical` | openai | `gpt-4o-2024-08-06` | 4096 | Yes |

**Google & Anthropic providers are fake** — they map back to `gpt-4o-2024-08-06` via OpenAI API key. The `executeGemini` and `executeClaude` methods in `enhanced-abstraction.ts` have hardcoded `.replace("gpt-4o-2024-08-06", ...)` mappings (lines 431, 508-510) that would need updating.

### Chat System (`config/chat.json`)

| Provider | Streaming Model | Structured Model | Enabled |
|----------|----------------|-----------------|---------|
| openai | `gpt-4o-2024-08-06` | `gpt-4o-2024-08-06` | Yes (default) |
| gemini | `gemini-1.5-pro` | `gemini-1.5-pro` | Yes (fallback) |
| anthropic | `claude-3-5-sonnet-20241022` | `claude-3-5-sonnet-20241022` | **No** |

**Issues:** `gemini-1.5-pro` is superseded by 2.0/2.5 series. `claude-3-5-sonnet-20241022` is superseded by Claude Sonnet 4.6.

---

## 2. Model Specifications

All prices per million tokens. `gpt-4o-2024-08-06` is our current pinned snapshot — identical to `gpt-4o` for scoring; listed once as `gpt-4o`.

| # | Model | Provider | Input $/M | Output $/M | Context | Max Output | Vision | Structured |
|---|-------|----------|-----------|------------|---------|------------|--------|------------|
| 1 | `gpt-3.5-turbo` | OpenAI | $0.50 | $1.50 | 16K | 4,096 | No | Limited |
| 2 | `gpt-4o` | OpenAI | $2.50 | $10.00 | 128K | 16,384 | Yes | Yes |
| 3 | `gpt-4o-mini` | OpenAI | $0.15 | $0.60 | 128K | 16,384 | Yes | Yes |
| 4 | `o4-mini` | OpenAI | $1.10 | $4.40 | 200K | 100,000 | Yes | Yes |
| 5 | `gpt-5.4` | OpenAI | $2.50 | $15.00 | 272K (1M exp.) | 128,000 | Yes | Yes |
| 6 | `gpt-5.4-mini` | OpenAI | $0.75 | $4.50 | 400K | 16,384 | Yes | Yes |
| 7 | `gpt-5.4-nano` | OpenAI | $0.20 | $1.25 | 400K | 16,384 | Yes | Yes |
| 8 | `gemini-2.0-flash` | Google | $0.10 | $0.40 | 1M | 65,535 | Yes | Yes |
| 9 | `gemini-2.5-flash` | Google | $0.30 | $2.50 | 1M | 65,535 | Yes | Yes |
| 10 | `gemini-2.5-pro` | Google | $1.25 | $10.00 | 1M | 65,535 | Yes | Yes |
| 11 | `claude-sonnet-4-6` | Anthropic | $3.00 | $15.00 | 200K | 16,000 | Yes | Yes |
| 12 | `claude-haiku-4-5` | Anthropic | $1.00 | $5.00 | 200K | 8,192 | Yes | Yes |

> **Note:** `gemini-2.0-flash` deprecated June 2026. `gpt-4o-2024-08-06` is a pinned snapshot of `gpt-4o` — use the `gpt-4o` alias going forward.

---

## 3. Capability × Model Matrix

### Scoring

Each cell: **S/C=O**

- **S (Suitability 1–10)**: Quality fit for the task (accuracy, speed, capabilities)
- **C (Cost 1–5)**: Cost efficiency (5 = cheapest viable, 1 = most expensive)
- **O (Overall)**: `round((S × 0.6) + (C × 2 × 0.4))` — normalized 1–10

Cost brackets:
- 5: < $0.30/M input
- 4: $0.30–$1.00/M input
- 3: $1.00–$2.50/M input
- 2: $2.50–$5.00/M input
- 1: > $5.00/M input

### Matrix

| Capability | gpt-3.5 | gpt-4o | 4o-mini | o4-mini | gpt-5.4 | 5.4-mini | 5.4-nano | gem-2.0f | gem-2.5f | gem-2.5p | sonnet-4.6 | haiku-4.5 |
|------------|---------|--------|---------|---------|---------|----------|----------|----------|----------|----------|------------|-----------|
| `ocr_extraction` | — | 9/2=7 | 6/5=6 | 8/3=6 | 10/2=7 | 8/4=6 | 6/5=6 | 5/5=5 | 8/4=6 | 9/3=7 | 8/1=6 | 5/4=5 |
| `extraction` | 5/5=5 | 8/2=6 | 7/5=7 | 7/3=6 | 9/2=7 | 8/4=6 | 7/5=7 | 6/5=6 | 7/4=6 | 8/3=6 | 8/1=6 | 6/4=6 |
| `medical_analysis` | 3/5=4 | 8/2=6 | 5/5=5 | 8/3=6 | 10/2=7 | 7/4=6 | 5/5=5 | 4/5=4 | 7/4=6 | 9/3=7 | 9/1=6 | 5/4=5 |
| `feature_detection` | 6/5=6 | 8/2=6 | 8/5=8 | 7/3=6 | 9/2=7 | 8/4=6 | 7/5=7 | 7/5=7 | 7/4=6 | 8/3=6 | 7/1=5 | 6/4=6 |
| `signal_processing` | 4/5=5 | 8/2=6 | 7/5=7 | 7/3=6 | 9/2=7 | 8/4=6 | 7/5=7 | 5/5=5 | 7/4=6 | 8/3=6 | 8/1=6 | 6/4=6 |
| `document_type_routing` | 6/5=6 | 8/2=6 | 8/5=8 | 7/3=6 | 9/2=7 | 8/4=6 | 8/5=8 | 7/5=7 | 7/4=6 | 7/3=5 | 7/1=5 | 6/4=6 |
| `quality_validation` | 5/5=5 | 8/2=6 | 7/5=7 | 7/3=6 | 9/2=7 | 8/4=6 | 7/5=7 | 6/5=6 | 7/4=6 | 8/3=6 | 7/1=5 | 6/4=6 |
| `serenity_form_analysis` | 3/5=4 | 9/2=7 | 5/5=5 | 7/3=6 | 10/2=7 | 7/4=6 | 5/5=5 | 4/5=4 | 7/4=6 | 9/3=7 | 9/1=6 | 5/4=5 |
| `ai_chat_streaming` | 4/5=4 | 9/2=7 | 6/5=6 | 5/3=4 | 10/2=7 | 8/4=6 | 6/5=6 | 5/5=5 | 7/4=6 | 8/3=6 | 9/1=6 | 6/4=6 |
| `ai_chat_structured` | 4/5=4 | 8/2=6 | 7/5=7 | 6/3=5 | 9/2=7 | 8/4=6 | 7/5=7 | 5/5=5 | 7/4=6 | 8/3=6 | 8/1=6 | 6/4=6 |
| **overall_import** | 4/5=5 | 8/2=6 | 7/5=7 | 7/3=6 | 9/2=7 | 8/4=6 | 7/5=7 | 5/5=5 | 7/4=6 | 8/3=6 | 8/1=6 | 6/4=6 |
| **overall_chat** | 4/5=4 | 9/2=7 | 7/5=7 | 6/3=5 | 10/2=7 | 8/4=6 | 7/5=7 | 5/5=5 | 7/4=6 | 8/3=6 | 9/1=6 | 6/4=6 |

### Key

- **—** = model lacks required capability (gpt-3.5 has no vision → can't do OCR)
- **overall_import** = weighted average of import flows (ocr×2, medical_analysis×2, others×1)
- **overall_chat** = weighted average of streaming×0.6 + structured×0.4

---

## 4. Recommendations

Top pick per flow based on highest Overall score, with runner-up as fallback.

| Flow | Best Pick (O) | Fallback (O) | Current → Change |
|------|--------------|-------------|-----------------|
| `ocr_extraction` | **gpt-4o** / **gpt-5.4** / **gem-2.5p** (7) | gem-2.5f (6) | gpt-4o-2024-08-06 → `gpt-4o` (unpin) |
| `extraction` | **gpt-4o-mini** / **gpt-5.4-nano** (7) | gpt-5.4 (7) | gpt-4o → `gpt-4o-mini` **(92% savings)** |
| `medical_analysis` | **gpt-5.4** (7) | gem-2.5p (7) | gpt-4o → `gemini-2.5-pro` or `gpt-5.4` |
| `feature_detection` | **gpt-4o-mini** (8) | gpt-5.4-nano / gem-2.0f (7) | gpt-4o → `gpt-4o-mini` **(94% savings)** |
| `signal_processing` | **gpt-4o-mini** / **gpt-5.4-nano** (7) | gpt-5.4 (7) | gpt-4o → `gpt-4o-mini` **(94% savings)** |
| `document_type_routing` | **gpt-4o-mini** / **gpt-5.4-nano** (8) | gem-2.0f (7) | gpt-4o → `gpt-4o-mini` **(94% savings)** |
| `quality_validation` | **gpt-4o-mini** / **gpt-5.4-nano** (7) | gpt-5.4 (7) | gpt-4o → `gpt-4o-mini` **(94% savings)** |
| `serenity_form_analysis` | **gpt-4o** / **gpt-5.4** / **gem-2.5p** (7) | sonnet-4.6 (6) | gpt-4o-2024-08-06 → `gpt-4o` (keep quality) |
| `ai_chat_streaming` | **gpt-4o** / **gpt-5.4** (7) | sonnet-4.6 / gem-2.5f (6) | gpt-4o-2024-08-06 → `gpt-4o` (unpin) |
| `ai_chat_structured` | **gpt-4o-mini** / **gpt-5.4-nano** (7) | gpt-5.4 (7) | gpt-4o → `gpt-4o-mini` **(94% savings)** |

### Phase 1 Quick Wins (available now)

Switch these flows to `gpt-4o-mini` immediately — no quality risk:
- `extraction`, `feature_detection`, `signal_processing`, `document_type_routing`, `quality_validation`
- `ai_chat_structured`

### Phase 2 Evaluate (requires testing)

- `medical_analysis` → `gemini-2.5-pro` (50% cheaper input, 1M context, strong reasoning)
- `ai_chat_streaming` fallback → `gemini-2.5-flash` (cheap, fast, 1M context)

### Phase 3 Future (when GPT-5.4 matures)

- `gpt-5.4` as primary for OCR, medical analysis, serenity, chat streaming
- `gpt-5.4-nano` as universal replacement for `gpt-4o-mini` (similar cost, better quality)

---

## 5. Cost Impact

### Per-Document Estimate (typical import: ~7 AI calls)

Assumes average 2K input tokens + 1K output tokens per call (OCR: 2K in + 4K out).

| Flow | Current (gpt-4o) | Phase 1 (mini) | Savings |
|------|------------------|----------------|---------|
| `ocr_extraction` (1×) | $0.015 | $0.015 (gpt-4o) | 0% |
| `extraction` (1×) | $0.015 | **$0.001** (4o-mini) | 93% |
| `medical_analysis` (1×) | $0.015 | $0.015 (gpt-4o) | 0% |
| `feature_detection` (1×) | $0.015 | **$0.001** (4o-mini) | 93% |
| `signal_processing` (1×) | $0.015 | **$0.001** (4o-mini) | 93% |
| `document_type_routing` (1×) | $0.015 | **$0.001** (4o-mini) | 93% |
| `quality_validation` (1×) | $0.015 | **$0.001** (4o-mini) | 93% |
| **Per document total** | **~$0.105** | **~$0.035** | **67%** |

### Per 1,000 Documents

| Scenario | Current | Phase 1 | Phase 2 (gem-2.5p for analysis) |
|----------|---------|---------|-------------------------------|
| 1K documents (all flows) | ~$105 | ~$35 | ~$33 |

### Chat Cost (per 1K conversations, ~10 messages each)

| Flow | Current | Phase 1 |
|------|---------|---------|
| Streaming (gpt-4o) | ~$125 | ~$125 (same) |
| Structured (gpt-4o → 4o-mini) | ~$125 | **~$8** |
| **Total** | **~$250** | **~$133** (47% savings) |

---

## 6. Implementation Notes

### Required Code Changes

#### 1. `src/lib/config/models.yaml`
- Update model IDs in provider `models` section
- Add new model entries for `gpt-4o-mini`, `gemini-2.5-flash`, `gemini-2.5-pro`
- Update flow assignments to use new model keys
- Remove fake Google/Anthropic providers (or make them real)
- Remove legacy `gpt4_turbo` and `gpt3_5` entries

#### 2. `src/lib/ai/providers/enhanced-abstraction.ts`
- **Line 431**: Remove hardcoded `.replace("gpt-4o-2024-08-06", "gemini-pro-vision")` — use actual model ID from config
- **Lines 508-510**: Remove hardcoded `.replace("gpt-4o-2024-08-06", "claude-3-sonnet-20240229")` — use actual model ID from config
- **Line 189**: Remove `.replace("gpt-4o-2024-08-06", "gpt4")` cost calculation hack
- Make provider methods pass through the model ID from config without string replacement

#### 3. `config/chat.json`
- Update all model names (see Recommendations above)
- Enable Anthropic provider
- Requires `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY` env vars to be set for real provider usage

#### 4. `src/lib/config/model-config.ts`
- Verify API key resolution supports `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY` env vars
- Update cost calculation to use per-model pricing (not single `cost_per_1k_tokens`)

#### 5. Environment Variables
- Add `GOOGLE_API_KEY` (for Gemini)
- Add `ANTHROPIC_API_KEY` (for Claude)
- Keep `OPENAI_API_KEY` (existing)

### Migration Strategy

**Phase 1 — Low risk, high savings (do now):**
- Switch `feature_detection`, `document_type_routing`, `extraction`, `signal_processing`, `quality_validation` to `gpt-4o-mini`
- Switch `ai_chat_structured` to `gpt-4o-mini`
- Unpin `gpt-4o-2024-08-06` → `gpt-4o` for remaining OpenAI flows
- Update `config/chat.json` model names

**Phase 2 — Add real multi-provider support:**
- Remove hardcoded model ID mappings in `enhanced-abstraction.ts`
- Add proper API key env vars for Google and Anthropic
- Test `gemini-2.5-pro` for `medical_analysis`
- Test `gemini-2.5-flash` as chat fallback

**Phase 3 — GPT-5.4 family evaluation:**
- Test `gpt-5.4` for OCR, medical analysis, serenity analysis, chat streaming
- Test `gpt-5.4-nano` as `gpt-4o-mini` replacement (better quality, slightly higher cost)
- Evaluate `gpt-5.4-mini` as mid-tier option for signal processing and extraction
- Consider `claude-sonnet-4-6` for medical extraction (strong structured output)
