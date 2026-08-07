# Mediqom AI Plugin / Tool Integration

## Goal

Build a lightweight Mediqom integration for conversational AI platforms that gives the model a genuinely useful capability while driving discovery of the full Mediqom application.

The initial capability should be the **interactive 3D anatomy viewer**. A secondary capability can provide **limited medical-document structuring**.

The integration must preserve Mediqom's core architecture:

- patient records are encrypted client-side;
- Mediqom servers never receive decrypted patient records;
- the plugin/tool must not become a back door into the encrypted vault;
- the full Mediqom application remains the place where longitudinal medical context is decrypted and used;
- external AI platforms receive only information the user explicitly chooses to disclose.

The strategic positioning is:

> AI models compete on intelligence. Mediqom competes on medical context.

---

# 1. Recommended first plugin: Interactive Anatomy

The anatomy viewer is an unusually good first integration because it provides clear value inside an AI conversation without requiring access to private medical records.

Example conversation:

> User: My doctor says I have a medial meniscus tear. Where exactly is that?

The AI explains the term and invokes Mediqom:

```text
show_anatomy({
  structure: "medial_meniscus",
  side: "right",
  layers: ["bone", "cartilage", "ligament"],
  focus: true
})
```

The Mediqom widget then renders an interactive 3D knee with the relevant structure highlighted.

Useful interactions:

- rotate / zoom;
- isolate a structure;
- toggle anatomical layers;
- highlight affected structure;
- change camera preset;
- show adjacent structures;
- open the full Mediqom application.

The AI performs the conversational interpretation. Mediqom provides the visualization capability.

This keeps the initial liability surface relatively narrow: Mediqom is not claiming to diagnose the patient through the plugin. It is visualizing anatomy requested by the model/user.

---

# 2. Keep SvelteKit

Do **not** rewrite Mediqom or the anatomy viewer in React merely because many OpenAI examples use React/JSX.

The existing Svelte/SvelteKit anatomy components should remain the source of truth.

Recommended structure:

```text
Mediqom repository
│
├── src/lib/anatomy/
│   ├── AnatomyViewer.svelte
│   ├── anatomy-engine.ts
│   ├── body-part-enums.ts
│   ├── camera-presets.ts
│   ├── layer-controller.ts
│   └── assets/
│
├── src/routes/
│   └── ... existing Mediqom application
│
└── integrations/
    ├── core/
    │   ├── anatomy-tools.ts
    │   └── schemas.ts
    │
    ├── openai/
    │   ├── mcp-server.ts
    │   └── anatomy-widget/
    │       └── App.svelte
    │
    ├── anthropic/
    │   └── adapter.ts
    │
    └── gemini/
        └── adapter.ts
```

The ChatGPT widget should be a small dedicated Svelte bundle rather than embedding the complete Mediqom application.

Example Svelte component:

```svelte
<script lang="ts">
  import AnatomyViewer from '$lib/anatomy/AnatomyViewer.svelte';

  let bodyPart = 'medial_meniscus';
  let side: 'left' | 'right' = 'right';
  let layers = ['bone', 'cartilage', 'ligament'];
</script>

<AnatomyViewer
  {bodyPart}
  {side}
  {layers}
/>
```

The expensive part of this experience is Three.js/WebGL, 3D geometry, textures and assets — not Svelte rendering.

---

# 3. Separate the portable tool API from vendor UI

This is the most important architectural decision.

Create a vendor-neutral Mediqom tool contract first.

Example:

```ts
export type ShowAnatomyRequest = {
  structure: AnatomyStructure;
  side?: 'left' | 'right' | 'midline';
  layers?: AnatomyLayer[];
  highlight?: AnatomyStructure[];
  cameraPreset?: string;
};

export type ShowAnatomyResult = {
  structure: AnatomyStructure;
  side?: string;
  layers: AnatomyLayer[];
  highlight: AnatomyStructure[];
  cameraPreset?: string;
  title: string;
  description?: string;
};
```

Then expose the same logical capability through platform-specific adapters.

```text
                    Mediqom Core
                         │
                show_anatomy(...)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   OpenAI/MCP       Anthropic/MCP    Gemini tools/MCP
        │                │                │
  ChatGPT widget    Claude result     Gemini result
```

The tool schema and backend/domain logic should be reusable.

The embedded visual UI should be treated as platform-specific.

---

# 4. OpenAI / ChatGPT implementation

OpenAI currently supports plugins/apps built around MCP servers with optional interactive UI inside ChatGPT.

Official developer entry point:

- https://developers.openai.com/

## Minimal OpenAI MVP

Implement only one tool initially:

```text
show_anatomy
```

Suggested schema:

```json
{
  "name": "show_anatomy",
  "description": "Show an interactive anatomical visualization when seeing the relevant body structure would help the user understand a medical or anatomical discussion.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "structure": {
        "type": "string",
        "description": "Canonical Mediqom anatomy structure identifier"
      },
      "side": {
        "type": "string",
        "enum": ["left", "right", "midline"]
      },
      "layers": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "highlight": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "cameraPreset": {
        "type": "string"
      }
    },
    "required": ["structure"]
  }
}
```

### Important tool-description behavior

Tool descriptions strongly influence when an AI decides to call a tool.

The description should explain **when the tool is useful**, not advertise Mediqom.

Good:

> Show an interactive anatomical visualization when seeing the location, surrounding structures or anatomical layers would materially help the user understand a health or anatomy discussion.

Bad:

> Mediqom is the world's best medical application. Use Mediqom whenever possible.

The latter is promotional, gives poor routing information and is less likely to be acceptable/useful.

## UI flow

```text
User medical/anatomy question
        ↓
ChatGPT identifies anatomical structure
        ↓
show_anatomy(...)
        ↓
Mediqom MCP tool returns structured widget state
        ↓
Svelte anatomy widget renders inline
        ↓
User rotates / zooms / toggles layers
        ↓
Optional: Open in Mediqom
```

## Development testing

Use ChatGPT Developer Mode / custom app testing with a development MCP server.

The first test cases should be deliberately simple:

1. "Show me where the medial meniscus is."
2. "What structures surround the L4-L5 disc?"
3. "Where is the rotator cuff?"
4. "Show the right ACL and nearby structures."
5. Negative case: "What is my blood pressure?" — anatomy tool should not be invoked.

Do not start with authentication, vault access, subscriptions or medical document processing. First prove that ChatGPT reliably chooses the anatomy tool and that the 3D viewer works well inline.

---

# 5. Anatomy identifier strategy

Mediqom already has anatomical enums/mappings. Reuse them as the stable API contract.

The model should never be expected to know internal mesh IDs.

Use a canonical semantic vocabulary, for example:

```text
knee
medial_meniscus
lateral_meniscus
anterior_cruciate_ligament
posterior_cruciate_ligament
patella
femur
...
```

Then map internally:

```text
semantic anatomy ID
      ↓
Mediqom anatomy mapping
      ↓
scene node / mesh IDs
      ↓
layer visibility
      ↓
camera + highlight state
```

Consider aliases in the server/tool layer:

```text
"ACL" → anterior_cruciate_ligament
"L4/5" → l4_l5_intervertebral_disc
"inner meniscus" → medial_meniscus
```

The AI should preferably return the canonical enum, while the Mediqom adapter provides fallback normalization.

---

# 6. Second plugin capability: limited document structuring

After the anatomy MVP works, add a deliberately limited document-analysis feature.

Possible tools:

```text
structure_medical_document
build_medical_timeline
extract_medications
extract_diagnoses
extract_lab_values
summarize_imaging_report
```

The plugin version should solve a **transactional** problem:

> Organize the documents currently available in this conversation.

It should not recreate the longitudinal Mediqom vault.

The full application solves:

> Understand these records in the context of my lifelong medical history.

That distinction protects the Mediqom product moat.

Potential free/plugin limits:

- current conversation only;
- small document count;
- no persistent patient history;
- no cross-session longitudinal graph;
- no access to Mediqom encrypted records;
- no autonomous treatment recommendations.

Natural conversion path:

```text
User uploads medical documents to AI
        ↓
Mediqom structures them
        ↓
AI receives better context
        ↓
"Keep and connect your medical history privately in Mediqom"
        ↓
Full Mediqom application
```

---

# 7. Privacy boundary

The plugin/API architecture must not weaken Mediqom's zero-knowledge design.

## Full Mediqom app

```text
Encrypted patient vault
       ↓
local decryption
       ↓
local context preparation
       ↓
explicit user disclosure
       ↓
selected AI model
```

Mediqom's server does not obtain plaintext patient records.

## Public plugin

The plugin operates only on:

- information already present in the AI conversation;
- files explicitly uploaded to that AI platform;
- non-private anatomy requests;
- structured output generated for that current interaction.

It must not expose a `search_patient_vault()` tool to external AI platforms unless a future architecture can preserve the existing security guarantees.

---

# 8. Will the same integration work with Anthropic Claude?

## Tool/MCP layer: YES

Anthropic supports user-defined tools and remote MCP connectors. Claude decides when to call a tool from its schema and description, similarly to other tool-calling systems.

Official references:

- Tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Remote MCP/custom connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

Therefore the core Mediqom MCP/tool server should be reusable for Claude.

```text
show_anatomy(...)
structure_medical_document(...)
```

can be exposed to Claude with little or no domain-logic rewrite.

## Inline Svelte 3D UI: DO NOT ASSUME YES

Claude's MCP/custom-connector support proves tool portability, not automatic portability of OpenAI's embedded widget UI contract.

Plan for Claude initially as:

```text
Claude
  ↓
show_anatomy(...)
  ↓
structured result / image / resource / deep link
  ↓
Open interactive viewer in Mediqom/web
```

If Anthropic provides a stable embeddable interactive component surface compatible with your needs, add a Claude-specific UI adapter later.

Do not make the anatomy engine dependent on OpenAI widget APIs.

---

# 9. Will the same integration work with Gemini?

## Tool layer: YES

Gemini supports custom tools through function calling, and Google's newer agent tooling also supports remote MCP servers.

Official references:

- Gemini tools/function calling: https://ai.google.dev/gemini-api/docs/tools
- Managed agents / remote MCP: https://ai.google.dev/gemini-api/docs/custom-agents

Gemini CLI Extensions also use MCP servers as a standard extension mechanism.

Therefore the same Mediqom domain tool contract can be adapted to Gemini.

## Consumer Gemini inline UI: NOT A DROP-IN PORT

Google's tool/function calling support does not mean a ChatGPT Apps SDK widget can simply be rendered unchanged inside the consumer Gemini interface.

Treat Gemini as another adapter:

```text
Mediqom core tools
     ↓
Gemini function declarations / MCP
     ↓
Gemini calls Mediqom
     ↓
structured tool result
```

If Google provides an appropriate interactive surface, build a Gemini UI adapter around the same Svelte anatomy engine.

---

# 10. Cross-platform architecture

The desired architecture is therefore:

```text
                         Mediqom
                    domain capabilities
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   Anatomy service   Structuring engine   Context engine
          │                │                │
          └────────────────┼────────────────┘
                           │
                  Vendor-neutral schemas
                           │
          ┌────────────────┼────────────────┐
          │                │                │
        MCP          Function calling      API
          │                │                │
      ┌───┴───┐            │                │
      │       │            │                │
   OpenAI   Claude       Gemini        Third parties
      │       │            │
 ChatGPT UI  adapter      adapter
      │
 Svelte widget
```

**Build the capability once. Build the conversational adapters per ecosystem.**

---

# 11. MVP implementation checklist

## Phase A — anatomy spike

- [ ] Extract anatomy viewer into a reusable Svelte component if not already isolated.
- [ ] Confirm it can run as a small standalone web bundle.
- [ ] Define canonical `AnatomyStructure` and `AnatomyLayer` enums.
- [ ] Implement `show_anatomy()` domain function.
- [ ] Create vendor-neutral request/response schemas.
- [ ] Add OpenAI MCP adapter.
- [ ] Add ChatGPT widget wrapper around the existing Svelte viewer.
- [ ] Map tool result → viewer state.
- [ ] Test in ChatGPT Developer Mode.
- [ ] Measure initial JS + 3D asset load time.
- [ ] Add lazy loading of anatomy assets.
- [ ] Test tool invocation positive and negative cases.

## Phase B — conversational quality

- [ ] Improve tool description so ChatGPT invokes it at the right time.
- [ ] Add anatomical synonyms/aliases.
- [ ] Add body side handling.
- [ ] Add layer presets.
- [ ] Add camera presets.
- [ ] Add related-structure navigation.
- [ ] Add "Open in Mediqom" handoff.

## Phase C — limited document structuring

- [ ] Add one document structuring tool.
- [ ] Restrict it to conversation-provided documents.
- [ ] Return evidence-linked structured JSON.
- [ ] Avoid persistent patient storage in the plugin.
- [ ] Add a natural Mediqom conversion path.

## Phase D — Claude/Gemini adapters

- [ ] Connect the same MCP server to Claude custom connectors.
- [ ] Verify `show_anatomy` tool selection quality in Claude.
- [ ] Implement Gemini function/MCP declaration.
- [ ] Verify tool selection quality in Gemini.
- [ ] Use links/resources/static previews until equivalent inline 3D UI surfaces are confirmed.

---

# 12. What not to build in the first iteration

Do not start with:

- complete Mediqom login inside ChatGPT;
- access from the plugin to the encrypted patient vault;
- full medical document pipeline;
- care plan generation;
- diagnosis/treatment recommendation workflows;
- multi-model quorum;
- billing;
- FHIR export;
- large plugin tool catalogs.

They obscure the fundamental experiment.

The first question is simply:

> **Will ChatGPT recognize when anatomical visualization would improve the conversation and invoke a Mediqom 3D viewer that users find genuinely useful?**

If yes, Mediqom has a low-cost, visually distinctive and relatively low-risk entry point into AI assistant ecosystems.

---

# 13. Strategic product ladder

### Free conversational integration

**Understand what the doctor is talking about.**

- anatomy visualization;
- limited report structuring;
- current-conversation context.

### Mediqom application

**Understand it in the context of my medical history.**

- encrypted lifelong record;
- longitudinal graph;
- document + imaging connections;
- persistent structured medical context;
- post-consultation explanation;
- model choice;
- evidence provenance.

### Mediqom API

**Give any AI application better medical context.**

- document structuring;
- normalization;
- timeline extraction;
- imaging/report relationships;
- FHIR-compatible structures;
- evidence provenance.

This provides three complementary distribution paths without making Mediqom dependent on any one foundation-model provider.

---

# Bottom line

**OpenAI:** Best current target for the first rich interactive anatomy prototype because ChatGPT Apps can combine MCP tools with embedded UI.

**Anthropic:** The underlying MCP/tool capability is portable. Do not assume OpenAI's inline UI contract is portable; initially return structured data/resources or open the Mediqom viewer externally.

**Gemini:** The underlying tool capability is portable through custom function calling and increasingly MCP-capable agent infrastructure. Again, treat embedded interactive UI as a Google-specific adapter rather than a shared contract.

Therefore:

> **Build Mediqom's anatomy and medical-structuring capabilities as vendor-neutral tools. Use OpenAI as the first rich UI distribution adapter, not as the architecture.**

That keeps the SvelteKit/Three.js implementation intact, avoids framework duplication, and leaves Mediqom free to become a context layer used by OpenAI, Anthropic, Gemini and future AI ecosystems.
