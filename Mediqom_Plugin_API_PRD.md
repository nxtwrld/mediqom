# Mediqom Plugin & Medical Context API --- Product Requirements Document

**Status:** Draft\
**Date:** 7 August 2026\
**Purpose:** Define the initial Mediqom plugin product, its relationship
to the Mediqom app, and the reusable API/tool layer for ChatGPT, Claude,
Gemini, and future AI platforms.

> **Revision note (2026-08-07).** Annotated against OpenAI's current plugin
> policy and against the codebase. The strategy holds; **the ChatGPT execution
> path does not, as written.** Four changes, marked ⚠️ inline:
>
> 1. **Verbatim source snippets are removed** from `map_report_anatomy` (§7).
>    They break the only PHI defence this architecture has, and policy language
>    cuts against them directly. Provenance moves host-side.
> 2. **The plugin must require no account** (§3). Anonymity is what keeps
>    normalized entities plausibly de-identified; OAuth would undermine it.
> 3. **Signup/upgrade CTAs are prohibited on ChatGPT** (§9, §14, §16).
>    `continue_in_mediqom` becomes a single informational link there and stays
>    intact for Claude/Gemini/API. The *"This report in context"* panel is fine;
>    only the action changes.
> 4. **The platform sequence inverts for the report wedge** (§20). ChatGPT
>    leads on anatomy; Claude and our own API lead on report structuring, where
>    the marketplace PHI rule, the anti-upsell rules and the ChatGPT Health
>    originality conflict do not apply.
>
> Separately: §9's context-gap panel promises longitudinal capability that is
> **not fully shipping** — `getPatientTimeline` is unreachable from the client
> executor and `ContextAssembler` is disconnected from chat. Fix or narrow the
> claim before launch.
>
> **Competitive update — ChatGPT Health (GA 23 Jul 2026, free on all tiers).**
> There is **no partner program** to join; it is closed, hand-picked, and the
> PHI ban was reaffirmed two weeks before its launch. Good news: Health has
> **no anatomy or imaging capability**, so our wedge faces no originality
> conflict. The real consequence is geographic — Health is **US-only,
> single-person, read-only and not zero-knowledge**, which points this funnel
> at the **EU first**. See §14.
>
> Engineering detail and full policy citations: `AI Plugin.md` §9, §9b, §10.

## 1. Executive Summary

Mediqom should not compete with general-purpose AI models on raw model
intelligence. Its differentiated value is **medical context**:
converting fragmented medical documents and imaging-related findings
into structured, normalized, longitudinal information that can improve
AI understanding.

The plugin strategy should therefore provide a useful but deliberately
limited subset of Mediqom capabilities inside third-party AI
environments. The initial wedge is:

> **Turn a medical report into something the user can understand and
> see.**

The plugin performs light document analysis, extracts and normalizes
anatomy and stated findings, maps them to Mediqom's anatomy enum, and
opens an interactive 3D anatomy visualization. It does not perform the
full longitudinal Mediqom analysis, QOM reasoning, diagnosis, treatment
assessment, or autonomous recommendations.

The full Mediqom application remains the place where encrypted records
are connected over time and analyzed using the complete patient context.

The same capabilities should be exposed through a reusable **Medical
Context Toolkit/API**, with thin adapters for ChatGPT, Claude, Gemini,
and future AI ecosystems.

------------------------------------------------------------------------

## 2. Strategic Positioning

### Core thesis

**AI models compete on intelligence. Mediqom competes on context.**

General-purpose AI can interpret an individual medical report, but it
normally lacks a persistent, structured understanding of the patient's
medical history. Mediqom creates that structure and preserves it
longitudinally.

### Product roles

**Third-party AI plugin** - Understand today's uploaded report. -
Extract anatomy and stated findings. - Normalize relevant terminology. -
Visualize findings in 3D. - Demonstrate the value of structured medical
context. - Create a natural handoff into Mediqom.

**Full Mediqom** - Maintain the user's encrypted medical memory. -
Connect new documents with previous records. - Compare findings over
time. - Build longitudinal timelines and relationships. - Run controlled
LangGraph/QOM analysis. - Provide evidence-linked post-consultation
understanding.

### Consumer messaging

**Plugin:**\
\> Mediqom turns medical reports into something you can see and
understand.

**Full product:**\
\> Mediqom connects those reports into your complete medical story.

------------------------------------------------------------------------

## 3. Privacy and Security Boundary

Mediqom's client-side encryption is non-negotiable.

The persistent medical vault is decrypted only in the Mediqom client.
Mediqom servers must never require access to the user's decrypted
longitudinal record.

The plugin is therefore **not a connector into the user's Mediqom
vault**.

For plugin use: - Only documents/data explicitly supplied in the host AI
conversation are processed. - The plugin has no implicit access to the
user's Mediqom history. - No persistent patient history is returned from
the encrypted vault. - Any handoff into Mediqom transfers the
task/question and non-sensitive workflow metadata, not decrypted medical
history. - Longitudinal context is assembled only inside Mediqom.

This limitation should be presented as a trust advantage rather than a
missing feature.

### The plugin requires no Mediqom account

Anonymity is a **compliance position**, not only a product choice, and it should
be treated as non-negotiable alongside client-side encryption.

OpenAI's App Developer Terms §2.4 bar an app from processing Protected Health
Information, unconditionally — no BAA path (§2.3 forecloses it: *"neither party
is processing personal data on behalf of the other"*), no health-app category,
no consent exception. Published policy is **silent** on whether normalized
clinical entities count as PHI, and that silence is what this PRD's §6
architecture depends on.

Anonymity is what keeps the silence working in our favour. With no account link
we hold no durable subject identifier, so a payload like
`{bodyRegion: "R_knee", findings: [...]}` carries none of the 18 HIPAA Safe
Harbor identifiers. **OAuth account linking would actively undermine this** — it
makes the same data individually identifiable to us. The platform supports
OAuth 2.1 fully; we decline it on PHI grounds, not capability grounds.

Two operational consequences: **never log tool arguments** against a session
(*"Redact PII before writing to logs"*), and **never accept verbatim report
text** (§7).

------------------------------------------------------------------------

## 4. Initial Plugin Use Case

### Primary user story

> As a user who has uploaded a medical report to an AI assistant, I want
> to understand what structures and findings the report refers to and
> see them anatomically, without requiring a full medical analysis.

### Example

User uploads an MRI report and asks:

> "What does this mean?"

The host AI reads the document and Mediqom receives structured semantic
input. Mediqom Lite validates and normalizes the relevant entities and
renders:

-   Document type: MRI
-   Body region: right knee
-   Structures: medial meniscus, ACL, femoral cartilage
-   Stated finding: posterior horn medial meniscus tear
-   Interactive 3D knee with the relevant structure highlighted

The experience should clearly distinguish: - what the source report
states; - anatomical mapping; - plain-language explanation; - model
inference, if any.

------------------------------------------------------------------------

## 5. Mediqom Lite Analysis Profile

The plugin uses a deliberately reduced analysis graph.

### In scope

1.  Document type classification
2.  Document/report date extraction
3.  Body region
4.  Laterality
5.  Anatomy enum mapping
6.  Stated finding extraction
7.  Finding-to-anatomy relationship
8.  Medical terminology normalization
9.  Source/provenance references
10. Plain-language explanation of report wording
11. 3D anatomy visualization

### Out of scope

1.  Diagnosis generation
2.  Differential diagnosis
3.  Treatment recommendations
4.  Medication changes
5.  Autonomous care recommendations
6.  Cross-record reasoning
7.  Comparison with previous Mediqom records
8.  Longitudinal disease progression analysis
9.  Full specialist-agent orchestration
10. QOM consensus
11. Generated care plans

The Lite profile must solve one job well rather than appear artificially
crippled.

------------------------------------------------------------------------

## 6. Host-Model Cost Optimization

The host AI should perform as much generic language understanding as is
safely practical.

### Principle

Do not pay Mediqom inference costs to repeat work the host model has
already performed.

### Plugin execution

``` text
Uploaded document
      ↓
Host model (ChatGPT / Claude / Gemini)
      ↓
Structured semantic tool call
      ↓
Mediqom schema validation
      ↓
Terminology + anatomy normalization
      ↓
Confidence/completeness checks
      ↓
3D anatomy viewer / structured result
```

The host model effectively acts as **Node 0**.

### Native Mediqom execution

``` text
Encrypted medical records
      ↓
Local decryption/context selection
      ↓
Mediqom-controlled extraction
      ↓
LangGraph specialist agents
      ↓
QOM / verification / synthesis
      ↓
Evidence-linked result
```

### Important constraint

The plugin cannot assume arbitrary access to the host model as a free
replacement for internal LangGraph nodes. Cost savings arise by
designing tool contracts so that the host model supplies structured
semantic input as part of its normal tool invocation.

Mediqom should validate host-model output and selectively trigger
additional analysis only when confidence, completeness, or schema checks
fail.

------------------------------------------------------------------------

## 7. Proposed Plugin Tool Surface

The first release should expose narrow, composable capabilities rather
than a generic `analyze_patient` tool.

### `map_report_anatomy`

**Purpose:** Convert structured findings from a medical report into
Mediqom anatomy identifiers.

Inputs: - document type - body region - laterality - extracted
structures - extracted findings

Outputs: - anatomy enum identifiers - normalized structures - normalized
findings - mapping confidence - unsupported/unresolved entities

> **⚠️ Removed: "optional source snippets/references."** Verbatim report text
> must not reach Mediqom's server. OpenAI's plugin guidelines cut against it
> twice: *"Do not request the full conversation history, **raw chat
> transcripts**, or broad contextual fields 'just in case'"* and *"Design the
> input schema to limit data collection by default, rather than **a funnel for
> optional context**."* An optional snippets field is that second phrase's
> textbook case and hands a reviewer a quotable basis for rejection.
>
> It also breaks the one defence this architecture has. Entities alone contain
> none of the 18 HIPAA Safe Harbor identifiers; quoted report text is the raw
> clinical record. See `AI Plugin.md` §9.
>
> **If provenance is needed, keep it host-side:** pass an anchor or offset the
> widget resolves client-side against content the host already holds, rather
> than transmitting the quote to us.

### `show_anatomy`

**Purpose:** Render the relevant Mediqom 3D anatomy view.

Inputs: - anatomy enum identifier(s) - laterality - optional finding
location - optional display/highlight instructions

Outputs: - interactive 3D visualization - labels - anatomical
relationships

### `explain_report_structure`

**Purpose:** Provide normalized, source-grounded representation of the
report.

Outputs may include: - document metadata - anatomical structures -
stated findings - plain-language terminology - provenance

### `continue_in_mediqom`

**Purpose:** Hand the current question/workflow into the Mediqom
application.

Payload should contain only: - question/task - relevant anatomy
identifiers - document type - requested workflow - short-lived
nonce/state

It must not retrieve or transmit the user's decrypted Mediqom history.

> **⚠️ Not shippable as a ChatGPT tool in this form.** Two problems:
>
> 1. **It cannot be a tool at all on that platform.** Guidelines permit linking
>    out from the widget (`window.openai.openExternal`), but *"Plugins must not
>    display subscription plans, initiate new subscriptions, or promote
>    upgrades"* — "freemium upsells" named explicitly — and may not *"link to a
>    page that explicitly initiates the process to upgrade, subscribe, or
>    complete a purchase."* A "continue into the app" handoff aimed at
>    non-users is a signup flow.
> 2. **Mediqom has no route to receive it.** `/import` does not exist as a page
>    route (only `src/routes/v1/import/*` APIs), `#overlay-import` is
>    write-only, and signup is invite-only in code
>    (`auth/+page.server.ts:80`, `shouldCreateUser: false`) with manual
>    approval.
>
> **On ChatGPT, replace this with a single informational link** — permitted
> explicitly: plugins may *"link to an informational page describing available
> plans or entitlement options."* No workflow payload, no nonce, no state
> transfer. See `AI Plugin.md` §9b.
>
> **Keep `continue_in_mediqom` as specified for Claude connectors, Gemini and
> the Mediqom API**, where these marketplace rules do not apply. This is the
> clearest instance of the platform split in §12.

------------------------------------------------------------------------

## 8. 3D Anatomy as the Acquisition Wedge

The 3D anatomy viewer should be the hero plugin feature.

Reasons: - Low marginal operating cost. - Visually differentiated. -
Immediately understandable. - Lower liability than diagnostic
reasoning. - Naturally useful for radiology and specialist reports. -
Highly shareable. - Demonstrates Mediqom's structured-data capability. -
Creates a natural bridge to longitudinal context.

Example trigger questions: - "Where is the medial meniscus?" - "My MRI
mentions the posterior horn. Show me where that is." - "What is
L4/L5?" - "Where is the supraspinatus?" - "Can you show me what part of
the knee this report is talking about?"

------------------------------------------------------------------------

## 9. Conversion into Full Mediqom

Conversion should be contextual, not a generic premium upsell.

After processing a report, the plugin can show the limits caused by
missing longitudinal context:

> **This report in context**
>
> This analysis covers the uploaded report only.
>
> With your private medical history, Mediqom can help determine: -
> whether the finding appeared in an earlier report; - how it has
> changed over time; - what previous specialists documented about it; -
> which related tests or consultations exist; - how this report fits
> into the broader medical timeline.

CTA:

> **Connect this to my medical history in Mediqom**

The missing functionality must be genuinely dependent on persistent
context rather than artificially paywalled.

> **⚠️ Two corrections before this ships.**
>
> **(a) The CTA wording is prohibited on ChatGPT.** "Connect this to my medical
> history" is an invitation to create an account — *"Plugins must not display
> subscription plans, initiate new subscriptions, or promote upgrades,"* and
> may not link to a page that *"initiates the process to upgrade, subscribe, or
> complete a purchase."* "Freemium upsells" are named explicitly.
>
> The *"This report in context"* panel above is **fine** — stating what cannot
> be answered without prior records is descriptive, not promotional. It is the
> action that must change. Permitted form: a single CTA to an **informational**
> page about what Mediqom is, e.g. **"How Mediqom keeps your records"**. One
> CTA maximum on the card, no Mediqom logo in the widget body (ChatGPT appends
> it). See `AI Plugin.md` §9b.
>
> **(b) Three of the five promises are not yet shipping.** The panel claims
> Mediqom can determine whether a finding appeared earlier, how it changed, and
> how it fits a timeline. Today:
>
> - `getPatientTimeline` is fully implemented and tested in
>   `medical-expert-tools.ts:1483` and registered at `:379`, **but the client
>   executor does not route it** — `client-tool-executor.ts:66-126` has five
>   cases and this is not one, so it returns `Unknown tool`. Documents decrypt
>   in the browser, so client-side is where it must run.
> - `ContextAssembler` is disconnected from the chat path:
>   `chat-context-base.ts:58` hardcodes `const searchResults: any[] = []`, so
>   `assembleContextForAI` never runs and `contextSummary` returns *"No
>   relevant medical context found."*
> - The fix is designed but unbuilt — `CONTEXT_DEVELOPMENT_STRATEGY.md` Phase 5
>   (`src/lib/wiki/`).
>
> This section's own principle — *"genuinely dependent on persistent context
> rather than artificially paywalled"* — is right, and it cuts both ways: the
> capability must also **exist**. Either land Phase 5 and the executor fix
> before launch, or narrow the panel to what ships. Promising longitudinal
> comparison we cannot yet perform converts users into disappointment and makes
> Experiment C measure the wrong thing.

------------------------------------------------------------------------

## 10. Liability-Minimizing Product Boundary

The plugin should primarily answer:

> **What does this report say, and where is it in the body?**

It should not answer:

> **What should I do medically?**

  Capability                               Plugin / Lite            Full Mediqom
  -------------------------------------- --------------- -----------------------
  Identify document type                             Yes                     Yes
  Extract body region/laterality                     Yes                     Yes
  Map anatomy enum                                   Yes                     Yes
  Extract stated findings                            Yes                     Yes
  Normalize terminology                              Yes                     Yes
  3D anatomy visualization                           Yes                     Yes
  Explain report wording                             Yes                     Yes
  Persistent medical history                          No                     Yes
  Compare prior reports                               No                     Yes
  Longitudinal trends                                 No                     Yes
  Cross-record reasoning                              No                     Yes
  Full LangGraph orchestration                        No                     Yes
  QOM consensus                                       No                     Yes
  Treatment assessment/recommendations                No   Restricted/controlled

Exact regulatory classification and claims require specialist
legal/regulatory review in each target market; product wording alone
does not eliminate medical-device or liability obligations.

------------------------------------------------------------------------

## 11. Medical Context Toolkit / API

The plugin should be one client of a reusable Mediqom capability layer
rather than a one-off implementation.

### Proposed toolkit capabilities

-   Anatomy mapping
-   Anatomy visualization
-   Medical terminology normalization
-   Finding normalization
-   Medication normalization
-   Laboratory normalization
-   Timeline construction
-   Finding relationship/linking
-   Provenance/evidence representation
-   Longitudinal context preparation

### Design principle

General-purpose AI supplies intelligence and conversational
orchestration where possible. Mediqom supplies domain-specific
structure, deterministic medical mappings, visualization, provenance,
and persistent context.

------------------------------------------------------------------------

## 12. Platform Integration Strategy

### ChatGPT

Initial focus: - light report structuring; - anatomy enum mapping; -
interactive 3D visualization; - contextual handoff to Mediqom.

Success criterion: determine whether the host assistant naturally
selects Mediqom for relevant medical-report/anatomy intents and whether
users engage with the visualization and handoff.

### Claude

Expose the same underlying tools through the integration mechanism
supported by Anthropic. Avoid duplicating domain logic. Claude should
supply structured semantic inputs into the same Mediqom schemas.

### Gemini

Expose equivalent tools through Google's supported extension/tool
ecosystem. Again, the Mediqom capability layer remains
platform-independent.

### Future platforms

Adapters should be thin. Core contracts and schemas belong to Mediqom,
not to any host platform.

------------------------------------------------------------------------

## 13. API Monetization

The external API is a potential second business line.

### Free / discovery layer

Low-cost capabilities may be offered generously: - anatomy mapping; -
basic normalization; - limited 3D anatomy use; - lightweight report
structuring.

### Paid API

Potential paid capabilities: - high-volume document normalization; -
medical terminology services; - FHIR-compatible structured output; -
longitudinal timeline construction; - provenance graph; - advanced
cross-document linking; - enterprise SLAs; - regulated/validated
workflows where applicable.

### Full Mediqom subscription

Consumer value remains: - encrypted persistent vault; - longitudinal
medical memory; - private context assembly; - multi-model AI; -
controlled LangGraph/QOM analysis; - post-consultation workflows.

------------------------------------------------------------------------

## 14. Go-to-Market Role of the Plugin

The plugin is primarily an **acquisition and product-discovery
channel**, not the core revenue product.

Funnel:

``` text
Medical question/report in ChatGPT, Claude or Gemini
        ↓
Mediqom Lite structures relevant findings
        ↓
User explores finding in 3D
        ↓
User understands value of structured medical data
        ↓
Plugin exposes missing longitudinal context
        ↓
Continue privately in Mediqom
        ↓
Persistent encrypted medical memory
```

This reaches users at the moment of highest intent: when they are
already using AI to understand their medical information.

> **⚠️ The funnel above is only fully legal off-ChatGPT.** The premise is right —
> intercepting users at peak intent is exactly the opportunity — but two of the
> stages are prohibited in the OpenAI directory, so the role of each platform
> differs.
>
> **On ChatGPT the plugin is a *discovery and recognition* surface, not a
> measured acquisition funnel.** *"Plugins must not serve advertisements and
> must not exist primarily as an advertising vehicle. Every plugin must deliver
> clear, legitimate functionality that provides standalone value to users."*
> The anatomy viewer clears that bar; a funnel whose value is the handoff does
> not. Stages 2 ("Lite structures relevant findings") and 6 ("Continue
> privately in Mediqom") are the constrained ones — see §7 and §9.
>
> Revised ChatGPT flow:
>
> ``` text
> Anatomy question in ChatGPT
>         ↓
> show_anatomy renders the interactive 3D view  ← standalone value, no account
>         ↓
> "This report in context" — what needs history to answer
>         ↓
> One informational link about Mediqom
>         ↓
> User decides, on our own site, whether to join
> ```
>
> **The full funnel as originally drawn belongs on Claude connectors, Gemini and
> our own API**, where marketplace rules do not apply. See §12 and `AI Plugin.md`
> §10.
>
> A third factor reinforces this: **ChatGPT Health is now a first-party product
> handling clinical records** (GA 23 July 2026, free on all tiers). Researched
> 2026-08-07 — three findings, two of them favourable:
>
> - **✅ No originality conflict for anatomy.** Health has no anatomy, no
>   imaging rendering and no 3D; its documented visual layer is *"seeing recent
>   data and trends."* It syncs radiologists' interpretations as text only. The
>   *"not natively supported"* test is comfortably passed.
> - **✅ There is no Health partner program to be excluded from.** The full
>   Plugins documentation export contains zero health mentions; apps inside
>   Health are named launch partners, not applicants. Nothing to apply to, and
>   nothing lost by not applying.
> - **✅ Health does not operate in our market.** It is **US-only** — the EEA,
>   Switzerland and the UK were excluded at the January release and remain
>   excluded at general availability. **Mediqom is Europe-only by choice**, so
>   Health is not a competitor in any market we serve.
>
> Were that ever to change, the gaps are documented: Health is
> **single-person** (verbatim: *"use a separate account"*), **read-only** with
> no export — disconnecting deletes rather than returns data — and **not
> zero-knowledge** (*"authorized OpenAI personnel and trusted service providers
> might access data… unless you have opted out"*). Mediqom ships 7 locales,
> family/caretaker profiles, user-owned exportable records, and client-side
> encryption OpenAI structurally cannot match: Health has to read the records
> to work.
>
> **Consequence for this PRD: the funnel premise is intact in Europe.** See
> `AI Plugin.md` §9b.

------------------------------------------------------------------------

## 15. Beta and Distribution

The private beta can reinforce scarcity and organic distribution.

Each beta user receives a limited number of invitations (initial
proposal: four).

Invitation should promote both: 1. the Mediqom application; and 2. the
relevant AI-platform integration when available.

The plugin provides a low-friction first experience before asking the
user to commit to maintaining a medical vault.

Key message:

> **Understand one report for free. Connect your medical story with
> Mediqom.**

> **⚠️ This line is fine in an invitation email; it is prohibited inside the
> ChatGPT widget.** "Understand one report for free" frames a free tier against
> a paid one, which reads as the *"freemium upsell"* the guidelines name
> explicitly. Keep it for our own channels — email, the web site, the beta
> invitation flow — where we set the rules.
>
> In-widget copy must describe the capability, not the commercial offer. See
> §9 and `AI Plugin.md` §9b.

------------------------------------------------------------------------

## 16. MVP Requirements

### P0 --- Required

-   Host-model structured tool input
-   Schema validation
-   Anatomy enum mapping
-   Laterality
-   Finding extraction/normalization contract
-   3D anatomy rendering
-   ~~Source/provenance display~~ → **host-side provenance only** (§7): the
    widget resolves an anchor against content the host already holds. No
    verbatim report text may reach Mediqom's server.
-   Clear distinction between report fact and interpretation
-   Safe failure for unresolved anatomy
-   ~~Deep link / handoff to Mediqom~~ → **one informational link** on ChatGPT
    (§9, §14). The full handoff stays P0 for Claude/Gemini/API.
-   No access to encrypted Mediqom vault
-   **No Mediqom account required; no OAuth** (§3) — compliance requirement,
    not a v1 shortcut
-   **No tool arguments written to logs** (§3)

### P1 --- Next

-   Plain-language medical terminology
-   Multiple findings in one report
-   Multiple anatomy structures in one visualization/session
-   Basic report timeline metadata
-   Confidence display
-   Host-platform analytics
-   Conversion analytics

### P2 --- Later

-   Medication normalization
-   Lab normalization
-   Limited multi-document timeline
-   Developer API access
-   Claude adapter
-   Gemini adapter
-   Enterprise API controls

------------------------------------------------------------------------

## 17. Success Metrics

### Plugin utility

-   Successful anatomy mapping rate
-   Unsupported anatomy rate
-   3D viewer engagement
-   Time spent interacting with anatomy
-   Repeat plugin use
-   User-rated usefulness

### Acquisition

-   Plugin → Mediqom handoff rate
-   Handoff → install/signup rate
-   First document import rate
-   First longitudinal-context question rate
-   Referral rate

> **⚠️ Not measurable on ChatGPT as written.** These metrics assume an
> attributed link into a signup flow. Three obstacles:
>
> - The CTA points at an **informational page**, not signup (§9, §14).
> - **No attribution exists in the codebase** — no `?src=`, no `utm_*`
>   anywhere. `docs/REFERRAL_LOOP_DESIGN.md` designs exactly this machinery and
>   is marked *"DESIGN ONLY. Nothing in this document is implemented yet"*; it
>   is itself blocked on a `subscription_tiers` enum reconciliation.
> - **Referral/attribution parameters are unaddressed in OpenAI's published
>   policy** — neither permitted nor prohibited. ChatGPT does append its own
>   `?redirectUrl=` to approved external links, so URL parameters are not
>   inherently disallowed, but we should not assume a referral scheme is
>   sanctioned. Open question for review.
>
> **For ChatGPT, measure plugin utility and reach**, which are attainable:
> tool-selection frequency, viewer engagement, repeat use, CTA click-through
> (host-side where available). **Keep the acquisition funnel metrics for
> Claude, Gemini and our own API**, where we control both ends. Building the
> attribution layer is a prerequisite for those, not for the ChatGPT launch.

### Economics

-   Mediqom inference cost per plugin session
-   Percentage of sessions requiring a Mediqom LLM fallback
-   Cost per acquired Mediqom user
-   API gross margin

### Safety

-   Unsupported/incorrect anatomy mappings
-   Hallucinated finding rate
-   Source-grounding failures
-   Attempts to generate treatment recommendations
-   Escalation/fallback frequency

------------------------------------------------------------------------

## 18. Key Experiments

### Experiment A --- Anatomy wedge

**Hypothesis:** Interactive anatomy creates sufficient standalone value
for host AI platforms to surface Mediqom and for users to engage.

Measure: - tool-selection frequency; - visualization engagement; -
repeat use.

### Experiment B --- Host model as Node 0

**Hypothesis:** Structured host-model tool calls can replace the first
Mediqom extraction LLM pass for most plugin sessions.

Measure: - schema pass rate; - mapping accuracy; - fallback rate; - cost
reduction versus native analysis.

### Experiment C --- Context-gap conversion

**Hypothesis:** Showing specific questions that cannot be answered
without prior records converts better than a generic Mediqom promotion.

Measure: - CTA click-through; - install/signup; - first record import.

> **⚠️ Run this experiment off-ChatGPT.** The hypothesis is sound and worth
> testing — but on ChatGPT the CTA cannot point at signup (§9), install/signup
> is not attributable (§17), and the longitudinal capability the panel promises
> is not fully shipping. Testing it there would measure a degraded variant and
> tell us little about the real mechanic.
>
> Run it where the funnel is intact — our own web surface, or a Claude
> connector — and treat ChatGPT as the reach experiment (Experiment A). If
> Phase 5 of `CONTEXT_DEVELOPMENT_STRATEGY.md` and the `getPatientTimeline`
> executor fix land first, the context-gap panel becomes truthful and this
> experiment becomes worth running properly.

### Experiment D --- Platform portability

**Hypothesis:** At least 80--90% of Mediqom plugin logic can remain
identical across OpenAI, Anthropic and Google integrations.

Measure: - shared code/schema percentage; - platform-specific
engineering effort.

------------------------------------------------------------------------

## 19. Open Questions

1.  Which anatomy enum coverage is sufficient for MVP?
2.  Which report types should be supported first: radiology only, or
    radiology plus discharge/specialist reports?
3.  How much plain-language explanation should Mediqom generate versus
    leave to the host model?
4.  What confidence threshold triggers a Mediqom-side LLM fallback?
5.  Should plugin sessions be anonymous by default?
6.  Which structured medical ontology standards should complement the
    internal anatomy enum?
7.  What parts of the toolkit should be public API versus Mediqom-only
    IP?
8.  What plugin/API functionality changes regulatory classification in
    the EU, US, and other launch markets?
9.  What host-platform capabilities and commercial terms exist at
    implementation time for ChatGPT, Claude and Gemini?
10. Should Careplan remain disabled from the initial focused product
    until longitudinal-context product-market fit is demonstrated?

### Resolved (2026-08-07)

**Q5 — Should plugin sessions be anonymous by default?**
**Yes, and not merely by default — mandatorily.** Anonymity is the mitigation
the entire PHI position rests on (§3). Account linking would make the entities
individually identifiable to us and undermine it. No OAuth.

**Q9 — What host-platform capabilities and commercial terms exist?**
Answered for OpenAI, as of 2026-08-07. The "Apps SDK" is now documented as
**"Plugins"** ([guidelines](https://developers.openai.com/plugins/app-guidelines);
[App Developer Terms, updated 9 Jul 2026](https://openai.com/policies/developer-apps-terms/)).
Load-bearing findings: PHI ban unconditional with no BAA path (Terms §2.4, §2.3);
normalized entities **unaddressed** in published policy; signup/subscribe/upgrade
CTAs prohibited, informational links permitted; promotional model-readable fields
prohibited; OAuth 2.1 supported but declined on PHI grounds; ChatGPT Health is
now a first-party competitor with originality-review implications. Full working
in `AI Plugin.md` §9 and §9b. **Anthropic and Google terms remain unchecked** —
do not assume they are looser.

**Q3 — How much plain-language explanation should Mediqom generate?**
Partially resolved by policy rather than product taste: the Usage Policies bar
*"tailored advice that requires a license"* and *"automation of high-stakes
decisions… medical."* §10's boundary — explain what the report **says** and
**where it is in the body**, never what to do — maps cleanly onto that language
and should be treated as a hard constraint, not a positioning preference.

**Still open, and now more urgent:** whether verbatim provenance can be
reconstructed host-side well enough to satisfy the "clear distinction between
report fact and interpretation" P0 requirement (§16) without transmitting quoted
text. That is a design question we have deferred, not answered.

------------------------------------------------------------------------

## 20. Recommended Delivery Sequence

**Phase 1 --- ChatGPT MVP** - Radiology-focused light analysis - Anatomy
enum mapping - 3D viewer - Mediqom handoff - Measure host-tool selection
and conversion

> **⚠️ Phase 1 as written mixes a low-risk capability with a high-risk one.**
> "Radiology-focused light analysis" carries the unresolved PHI question; the
> 3D viewer does not. Bundling them puts the whole submission behind the
> riskiest component and delays the reach experiment for no benefit.
>
> **Split Phase 1:**
>
> - **1a --- ChatGPT anatomy MVP.** `show_anatomy`, `explain_structure`,
>   `list_anatomy_regions`. Anonymous, no document input, one informational
>   link. Measures host-tool selection and viewer engagement — Experiment A,
>   the project's actual premise.
> - **1b --- Report structuring**, on **Claude connector or the Mediqom API
>   first**, not ChatGPT. Same schemas, same domain logic; a surface where the
>   PHI gray zone, the anti-upsell rules and the ChatGPT Health originality
>   conflict do not apply.
>
> Only bring 1b to ChatGPT if 1a is approved and the entities-only posture
> survives review contact. The ordering in Phase 4 ("Claude adapter" as a
> late-stage port) inverts accordingly: for the report wedge, **Claude is the
> lead platform, not the follower.**

**Phase 2 --- Cost optimization** - Use host model as Node 0 - Add
deterministic validation - Add confidence-based LLM fallback - Establish
unit economics

**Phase 3 --- Toolkit/API** - Stabilize platform-neutral schemas -
Expose selected normalization and anatomy capabilities - Introduce
developer/enterprise access

**Phase 4 --- Multi-platform** - Claude adapter - Gemini adapter -
Compare acquisition quality and economics

**Phase 5 --- Expand context services** - Labs, medications, timelines,
and selected cross-document capabilities - Preserve longitudinal
reasoning as the premium Mediqom differentiator

------------------------------------------------------------------------

## 21. Product North Star

Mediqom should become the **AI Context Layer for Healthcare**.

The plugin demonstrates that structured medical context makes an
individual AI interaction better.

The Mediqom application demonstrates that persistent, encrypted
longitudinal context makes every future interaction better.

The API allows the same domain capabilities to improve other healthcare
and AI products without turning Mediqom into another general-purpose
model provider.
