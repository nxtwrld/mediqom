# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Map the blast radius before editing.** List every place the change must reach: callers, tests, fixtures, locale JSON (`src/lib/i18n`), `.d.ts` types, schema ↔ `Section*.svelte` pairs, and `fetch` forwarding for `apiFetch` in load functions. For a bug, find every caller and fix the root cause once in shared code — not per call site.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**Close every task with what you didn't do.** End with 1–2 lines: what was skipped or left unverified, and the risk. Mandatory for changes touching encryption, RLS, auth or audit logging.

**Mark deliberate shortcuts** in code as `// shortcut: <limitation>, <upgrade when>` so `/debt` can collect them.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project Overview

**Mediqom** is a medical records explorer and conversation analysis platform built with SvelteKit that records and analyzes doctor-patient consultations using real-time AI processing. The application combines audio transcription, AI-powered medical analysis, and structured health data management with strong privacy and security measures.

## Development Commands

### Core Development

- `npm run dev` - Start development server - never run it yourself - we are already running it
- `npm run build` - Build production version
- `npm run preview` - Preview production build
- `npm run check` - Run SvelteKit sync and type checking
- `npm run check:watch` - Run type checking in watch mode

### Code Quality

- `npm run lint` - Run Prettier and ESLint checks
- `npm run format` - Format code with Prettier

### Testing

- `npm test` - Run all tests (integration + unit)
- `npm run test:integration` - Run Playwright integration tests
- `npm run test:unit` - Run Vitest unit tests

### Mobile / Capacitor

- `npm run mobile:build` - Build mobile version
- `npm run mobile:sync` - Sync web assets to native projects
- `npm run mobile:ios` - Open iOS project in Xcode
- `npm run mobile:android` - Open Android project in Android Studio
- `npm run mobile:dev` - Start mobile development server

## Rule: always use qmd before reading files

Before reading files or exploring directories, always use qmd to search for information in local projects.


## Architecture Overview

### Main Application Structure

- **Authentication**: Supabase-based auth with session management via `src/lib/auth.ts` and `src/hooks.server.ts`
- **Real-time Sessions**: In-memory session store with EventEmitter updates via `src/lib/session/manager.ts`
- **AI Analysis**: Chat on Vercel AI SDK + AI Gateway; import and session analysis on LangChain/LangGraph (see AI stack below)
- **Audio Pipeline**: Real-time transcription with Voice Activity Detection, MP3 encoding, and multiple transcription providers
- **Medical Data**: FHIR-aligned health records with comprehensive medical configurations (full FHIR adoption is pending — see `docs/architecture/ONTOLOGY.md`)
- **Encryption**: Multi-layer security with AES/RSA encryption for sensitive health data

### Document Import Architecture

- **Client Processing**: Document handling and UI in `src/components/import/` with SSE progress streaming
- **Server Analysis**: AI processing in `src/lib/import.server/` with multi-provider support
- **LangGraph Workflow**: Advanced orchestration in `src/lib/langgraph/` with 23+ specialized nodes
- **Import Modes**: Dual support for traditional batch and real-time SSE streaming
- **Security Model**: Client-side AES encryption with RSA key management - server never accesses raw keys
- **Workflow Features**: Recording/replay for development, parallel processing, selective analysis

### Key Directories

- `src/lib/` - Core business logic and utilities
- `src/lib/chat/` - AI chat system (chat-manager, ai-service, client-service, MCP tools)
- `src/lib/context/` - Context assembly pipeline (context-composer, MCP tools, integrations)
- `src/lib/session/` - Session management (manager, stores, QOM pipeline, transport)
- `src/lib/capacitor/` - Mobile platform adapters (auth, plugins)
- `src/lib/encryption/` - AES/RSA encryption utilities
- `src/lib/audio/` - Audio processing and transcription providers
- `src/lib/langgraph/` - LangGraph document processing workflows
- `src/lib/configurations/` - Medical extraction schemas (54 files)
- `src/lib/import.server/` - Server-side import processing
- `src/components/` - Reusable Svelte components organized by feature
- `src/routes/` - SvelteKit routing with API endpoints in `v1/` subdirectory
- `src/data/` - Medical reference data and configurations
- `src/css/` - Global stylesheets organized by component type
- `mobile/` - Shared mobile resources
- `android/` - Android native project (Capacitor)
- `ios/` - iOS native project (Capacitor)

### Important Configuration Files

- `svelte.config.js` - Vercel adapter with custom aliases (`$components`, `$data`, `$media`)
- `capacitor.config.ts` - Capacitor mobile project configuration
- `vite.config.mobile.ts` - Mobile-specific Vite build config
- `svelte.config.mobile.js` - Mobile-specific SvelteKit config
- `src/app.mobile.html` - Mobile HTML entry point
- `playwright.config.ts` - Integration testing configuration
- Path aliases: Use `$lib`, `$components`, `$data` for imports

### Medical Domain Specifics

- **Session Management**: Medical consultations are tracked as real-time sessions with transcript analysis
- **FHIR alignment**: Medical data structures are modelled on FHIR; not yet a formal FHIR substrate
- **Multi-language Support**: Internationalization for Czech, German, and English
- **Privacy-First**: Encrypted health data storage with public key cryptography

### API Structure

- API routes follow `/v1/` prefix pattern
- Real-time features use Server-Sent Events (SSE)
- Authentication handled via Supabase hooks
- Protected routes require session validation

## Technology Stack & Dependencies

### Core Framework

- **SvelteKit 2.x** with Svelte 5.x (uses new runes syntax)
- **Vite** for build tooling and development server
- **TypeScript** with strict type checking enabled
- **Vercel** deployment adapter with 300s timeout for complex medical analysis

### AI & Language Processing

- **Vercel AI SDK + AI Gateway** for chat — `src/lib/ai/gateway.ts`, model switcher in `src/lib/ai/model-catalog.ts`. See `docs/architecture/AI_GATEWAY.md`
- **LangChain / LangGraph** for import, session and other flows — models in `src/lib/config/models.yaml` (still gpt-4o; migration to the gateway pending)
- **Transcription**: Deepgram streaming, AssemblyAI, Google Speech SDK, Whisper

### Audio Processing

- **@ricky0123/vad-web** for Voice Activity Detection
- **Howler.js** for audio playback and sound effects
- **LameJS** for MP3 encoding
- **Meyda** for audio feature extraction and analysis

### UI & Styling

- **Custom CSS architecture** with modular stylesheets (no external CSS framework)
- **CSS custom properties** for theming and consistent spacing
- **Responsive design** with mobile-first approach
- **3D visualization** using Three.js for anatomical models

### Database & Storage

- **Supabase** for authentication, database, and real-time features
- **Vercel Blob** for file storage and document management
- **Local storage** for session persistence and user preferences

### Development & Testing

- **Playwright** for end-to-end testing
- **Vitest** for unit testing
- **ESLint** and **Prettier** for code formatting
- **mdsvex** for markdown processing with Mermaid diagram support

## Code Patterns & Conventions

### Component Architecture

- **Feature-based organization**: Components grouped by functionality (anatomy, charts, documents, forms, etc.)
- **Svelte 5 runes syntax REQUIRED**: Always use `$state()`, `$props()`, `$bindable()` for reactive state management
- **Data management**: Use Svelte stores for shared state, avoid overusing `$effect()` and `$derived()` - prefer store subscriptions
- **Snippet-based composition**: Components use `children?: import('svelte').Snippet` for content projection
- **Event dispatcher pattern**: Components emit custom events for parent communication using `createBubbler()`
- **No multiline inline handlers**: Never write logic directly in HTML event attributes.
  Extract to a named function in `<script>` and reference it: `onclick={handleSave}`.
  One-liners that just call a function are fine: `onclick={() => open(item)}`.

### TypeScript Patterns

- **Strict typing**: All code uses TypeScript with strict compiler options
- **Interface-first design**: Types defined in `.d.ts` files for reusability
- **Enum usage**: Medical data uses TypeScript enums (e.g., `BloodType`, `SexEnum`)
- **Generic types**: AI providers use generic interfaces for flexibility

### State Management

- **Centralized stores**: Global state managed via Svelte stores in `src/lib/*/store.ts`
- **Session management**: Real-time sessions use EventEmitter pattern with in-memory storage
- **Local storage persistence**: User preferences and session data persisted locally
- **Supabase integration**: Auth state synchronized with Supabase session management

### API Design

- **RESTful conventions**: API routes follow `/v1/` versioning pattern
- **Type-safe endpoints**: All API responses use TypeScript interfaces
- **Error handling**: Standardized error responses with proper HTTP status codes
- **SSE integration**: Real-time features use Server-Sent Events for streaming updates

### apiFetch & SvelteKit `fetch` (CRITICAL)

All API calls go through `apiFetch()` from `$lib/api/client.ts`. It handles both web (cookies) and Capacitor/mobile (Bearer token) automatically.

**Rule: Always pass `{ fetch }` in load functions.**

SvelteKit load functions receive a special `fetch` that supports relative URLs during SSR, deduplicates requests, and avoids `window.fetch` warnings. Even when `ssr = false`, SvelteKit still expects its own `fetch` to be used inside load functions.

```typescript
// In any +layout.ts or +page.ts load function:
export const load: LayoutLoad = async ({ fetch }) => {
  const data = await apiFetch("/v1/med/user", { fetch });
};
```

**Rule: Functions called from load functions must accept and forward `fetch`.**

If a utility function (like `loadProfiles`) uses `apiFetch` internally and is called from a load function, it must accept an optional `fetchFn` parameter and pass it through:

```typescript
// In utility module:
export async function loadProfiles(
  force = false,
  fetchFn?: typeof globalThis.fetch,
) {
  const fetchOpts = fetchFn ? { fetch: fetchFn } : {};
  const data = await apiFetch("/v1/med/profiles", fetchOpts);
}

// In load function:
await loadProfiles(false, fetch);
```

**SSR configuration:**

- `med/` routes: `ssr = false` — all load functions run client-side, but still pass `{ fetch }`
- Root `+layout.ts`: SSR enabled — `{ fetch }` is required for `/account` route SSR
- Capacitor builds: SSR always disabled, `apiFetch` uses Bearer tokens via `getAccessToken()`

## Configuration System

### Feature Flags

- **Environment-based flags**: Features controlled via `PUBLIC_ENABLE_*` environment variables
- **Runtime toggles**: Feature flags accessible at `src/lib/config/feature-flags.ts`
- **Key features**: Enhanced signals, LangGraph workflows, multi-provider AI, external validation

### AI Model Configuration

- **Chat**: model catalog in `src/lib/ai/model-catalog.ts`, routed through the AI Gateway
- **Other flows**: per-flow models in `src/lib/config/models.yaml` (LangChain)

### Medical Configuration Schema

- **Structured schemas**: Medical configurations in `src/lib/configurations/` with TypeScript interfaces
- **Multi-language support**: Schemas support Czech, German, and English localization
- **Validation patterns**: Schema validation with confidence scoring and error handling

## Component Development Guidelines

### Styling Conventions

- **CSS custom properties**: Use `--color-*`, `--font-*`, `--ui-*` variables for consistency
- **Modular CSS**: Separate stylesheets for different component types (buttons, forms, documents, etc.)
- **No external frameworks**: Custom CSS architecture without Bootstrap, Tailwind, etc.
- **Responsive design**: Mobile-first approach with consistent spacing units

### Component Structure

```svelte
<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    const bubble = createBubbler();

    interface Props {
        // Define props interface
    }

    let { prop1, prop2 }: Props = $props();
    let localState = $state(initialValue);
</script>

<!-- Template with proper event handling -->
<div use:bubble>
    <!-- Component content -->
</div>

<style>
    /* Component-specific styles */
</style>
```

### Form Components

- **Unified Input component**: Single `Input.svelte` handles multiple input types
- **Common UI components**: Placed in the `src/components/ui`
- **Validation patterns**: Client-side validation with visual feedback
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **File handling**: Specialized components for file upload and preview

### Styling

- **common styles**: All common styles are loaded from `src/css`
- **css variables**: The common css variables are loaded from `src/css/core.css`

### Icons

- **Icon sprites**: Three SVG sprite files in `static/` - `icons.svg`, `icons-o.svg`, `files.svg`
- **Source files**: Add new icons to `assets-src/icons/`, `assets-src/icons-outline/`, or `assets-src/files/`
- **Generate sprites**: Run `node svgToSprite.js` from `assets-src/` directory
- **Usage**: `<svg><use href="/icons.svg#icon-name"></use></svg>` (use `href` not `xlink:href`)
- For detailed reference, use the `/icons` command

### Localisation

- **localisation library**: Using $t() key translation from `src/lib/i18n`
- **translator agent**: Use the `translator` sub-agent to scan Svelte files for hardcoded text and convert them to `$t()` calls. The agent extracts text from element content, aria-labels, placeholders, and titles, generates keys following `namespace.category.kebab-case` conventions, and updates both Svelte and JSON locale files. Czech/German values are left empty for human review. Invoke via `/translate <file-or-directory>`.

## UI event

- ** global event emitter**: we are using `src/lib/ui.ts` to trigger namespace events globally

## Database & API Patterns

### Supabase Integration

- **Server-side client**: Created in `hooks.server.ts` with cookie-based session management
- **Client-side client**: Managed via `src/lib/supabase.ts` with client registry pattern
- **Protected routes**: Authentication checks in `+layout.server.ts` files
- **Session validation**: Use `safeGetSession()` for JWT validation

### API Route Structure

```typescript
export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  // Auth check
  const { session } = await safeGetSession();
  if (!session) error(401, { message: "Unauthorized" });

  // Request processing
  const data = await request.json();

  // Response
  return json(result);
};
```

### Real-time Features

- **SSE endpoints**: Server-Sent Events for streaming AI analysis results
- **Session tracking**: Real-time session management with EventEmitter updates
- **Progress tracking**: Incremental updates for long-running operations

## Security & Privacy

### Data Protection

- **Multi-layer encryption**: AES/RSA encryption for sensitive health data
- **Public key cryptography**: User-controlled encryption keys
- **Secure storage**: Encrypted data storage with Supabase RLS policies
- **Session security**: Secure cookie handling with proper expiration

### Authentication Flow

- **Supabase Auth**: Email/password authentication with session management
- **Protected routes**: Server-side authentication checks
- **Client-side guards**: Route protection with redirect handling
- **Session persistence**: Secure session storage with automatic refresh

### HIPAA Audit Logging

- **Utility**: `src/lib/audit/index.server.ts` — `auditFromEvent(event, details)` fire-and-forget
- **Database**: `audit_logs` table with RLS (users SELECT own; service_role INSERT+SELECT; no UPDATE/DELETE)
- **Zero-knowledge**: Logs contain IDs, types, actions — never plaintext medical data
- **Coverage**: 16 endpoints — documents, profiles, shares, imports, chat, sessions, encryption, recovery, account deletion

## Logging

- **Namespace-based logging**: Organized by feature (Session, Audio, Analysis, etc.) — use `logger.session`, `logger.analysis`, …
- **Runtime configuration**: Logging configurable via `window.logger` object

## Chat System

- **Library**: `src/lib/chat/` - Chat manager, AI service, client service, tool executor, MCP wrapper, store
- **Components**: `src/components/chat/` - AIChatSidebar, ContextPrompt
- **API**: `src/routes/v1/chat/conversation/+server.ts`
- **Context Assembly**: `src/lib/context/` - Context composer, MCP tools, integrations
- For detailed context, use the `@chat` command. Reference: `docs/features/chat/CHAT.md` (current), `docs/features/chat/WIDGETS.md`

## Medical Configuration Schemas

- 54 config files in `src/lib/configurations/` define AI extraction schemas
- Schema pattern: `FunctionDefinition` with JSON Schema parameters
- Core composition: `core.*.ts` properties spread into specialized schemas
- 1:1 mapping to `src/components/documents/Section*.svelte` display components (33 files)
- For detailed context, use the `@schema` command

## Context Assembly System

- **Code**: `src/lib/context/` - Context composer, token optimization, MCP tools
- **Integrations**: Client/server context providers, session and profile context
- **MCP Tools**: Medical expert tools for document search, patient timeline, profile data
- Reference: `docs/architecture/CONTEXT_MANAGEMENT.md`, `docs/plans/CONTEXT_ROADMAP.md`

## Audio / Transcription Pipeline

- **Core Audio**: `src/lib/audio/` - AudioManager, microphone, streaming transcription
- **Session Audio**: `src/lib/session/audio/` - Audio processing, VAD helpers, microphone utils
- **Providers**: AssemblyAI, Google Speech SDK, Deepgram, Whisper
- Reference: `docs/features/session/TRANSCRIPTION.md`

## Mobile / Capacitor Development

- **Config files**: `capacitor.config.ts`, `vite.config.mobile.ts`, `svelte.config.mobile.js`, `src/app.mobile.html`
- **Platform adapters**: `src/lib/capacitor/auth.ts`, `src/lib/device.ts`
- **Native directories**: `android/`, `ios/`, `mobile/`
- For detailed context, use the `@mobile` command. Reference: `docs/design/RESPONSIVE.md`, `docs/guides/MOBILE_AUTH.md`

### Keyboard Handling on Native (iOS/Android)

**Key facts:**
- `capacitor.config.ts` sets `Keyboard.resize: "none"` — the native WebView frame never resizes when the keyboard appears. `window.innerHeight` and `visualViewport` are both unaffected, so CSS-only or `visualViewport`-based approaches won't detect the keyboard.
- Use the **Capacitor Keyboard plugin events** (`keyboardWillShow` / `keyboardWillHide`) — they fire with the exact native keyboard height before the animation starts.
- `src/lib/capacitor/keyboard-store.ts` exports a `keyboardHeight` writable store (number, px). It is updated by `initKeyboard()` in `src/lib/capacitor/index.ts` which is called once at app startup.

**Pattern for any fixed/absolute component that must stay above the keyboard:**

```svelte
<script lang="ts">
  import { keyboardHeight } from '$lib/capacitor/keyboard-store';
</script>

<!-- Use $keyboardHeight directly — it's 0 on web, real px on native -->
<div class="my-panel" style="bottom: {$keyboardHeight}px">
  <!-- content -->
</div>
```

The panel must have both `top` and `bottom` set (or use `height`) so that raising `bottom` shrinks it rather than moving it off-screen.

**iOS auto-zoom prevention:** iOS zooms any input with `font-size < 16px`. Always set `font-size: 16px` on `<input>` and `<textarea>` inside `@media (max-width: 768px)` blocks. The mobile viewport also has `maximum-scale=1.0` as a safety net.

**Pattern for scrollable forms with multiple inputs** — use the `keyboardScroll` action from `src/lib/capacitor/keyboard-scroll.ts`. Attach it once to the scroll container; it automatically adds `padding-bottom` equal to the keyboard height and scrolls the focused input into view.

```svelte
<script lang="ts">
  import { keyboardScroll } from '$lib/capacitor/keyboard-scroll';
</script>

<div class="form-scroll" use:keyboardScroll>
  <input ... />
  <input ... />
  <textarea ... />
</div>
```

No per-input logic needed. On keyboard hide the padding is removed automatically.

## Session Development

For session development context, use the `@session` command.

- **What runs today**: live analysis goes through `src/lib/session-deprecated/analyzeConversation.ts`; `src/lib/session/qom/` drives the visualisation only.
- **MoE/QOM expert pipeline** is a plan, not built — see `docs/plans/SESSION_MOE.md`.

## CSS Architecture & Styling Guidelines

> **See [`DESIGN.md`](DESIGN.md)** (repo root) for the full design system —
> canonical color/spacing/radius/z-index tokens, typography, the component
> catalog, and Do's & Don'ts. Token source of truth is `src/css/core.css`.

### Core Principles

1. **Use existing CSS files** - Never create inline styles or custom classes when standard ones exist
2. **Follow established patterns** - Look at existing components (e.g., HealthForm.svelte) before creating new ones
3. **Use CSS variables** - All spacing, colors, and sizing should use variables from core.css

### Key CSS Files

- **`src/css/core.css`** - CSS variables (colors, spacing, sizing)
- **`src/css/forms.css`** - Form inputs, labels, buttons
- **`src/css/tabs.css`** - Tab navigation styling
- **`src/css/buttons.css`** - Button styles and modifiers
- **`src/css/typography.css`** - Headings, text styles

### Standard Patterns

#### Tabs Pattern

**Use the Tabs component system:**

```svelte
<Tabs fixedHeight={true}>
  {#snippet tabHeads()}
    <TabHeads>
      <TabHead>{$t('tab1')}</TabHead>
      <TabHead>{$t('tab2')}</TabHead>
    </TabHeads>
  {/snippet}

  <TabPanel><!-- Content 1 --></TabPanel>
  <TabPanel><!-- Content 2 --></TabPanel>
</Tabs>
```

**Or for route-based tabs:**

```svelte
<nav class="tab-heads">
  <a href="/path1" class:"-active"={isActive('/path1')}>Tab 1</a>
  <a href="/path2" class:"-active"={isActive('/path2')}>Tab 2</a>
</nav>
```

**Don't:** Create custom `.tab-navigation` or `.tab-link` classes

#### Form Pattern

**Use the `.input` class pattern:**

```svelte
<form class="form">
  <Select
    bind:value={myValue}
    options={myOptions}
    label={$t('label')}
  />
  <!-- Select component handles .input class internally -->

  <div class="form-actions">
    <button class="button -primary" type="submit">Save</button>
  </div>
</form>
```

**Don't:** Create custom `.form-group` or `.form-container` wrappers

#### CSS Variables

**Always use these variables instead of hard-coded values.** Root is 62.5% (1rem = 10px, follows the user's font setting) — size in `rem`; see "Sizing policy" in `DESIGN.md`.

```css
/* Spacing */
--ui-pad-small: 0.8rem --ui-pad-medium: 1.6rem --ui-pad-large: 2.4rem
  --ui-pad-xlarge: 3.2rem /* Radius */ --ui-radius-small: 0.4rem
  --ui-radius-medium: 0.8rem --ui-radius-large: 1.6rem /* Colors */
  --color-surface: /* Light background */ --color-border: /* Border color */
  --color-text-primary: /* Main text */ --color-text-secondary: /* Muted text */
  --color-positive: /* Success */ --color-negative: /* Error */
  --color-warning: /* Warning */;
```

**Don't:** Use hard-coded values like `padding: 1rem` or `color: #333`

### Component Library

Reference these components for standard UI patterns:

- **Forms:** `src/components/forms/` - Input, Select, InputDateTime, etc.
- **UI:** `src/components/ui/` - Tabs, Modal, Button patterns
- **Profile:** `src/components/profile/HealthForm.svelte` - Example of proper tab usage

### Before Creating Custom Styles

1. **Search existing CSS** - Use `qmd search "css pattern"` to find existing styles
2. **Check components** - Look at `src/components/` for similar patterns
3. **Read CLAUDE.md** - Review this section and other guidelines
4. **Ask for guidance** - If unsure, ask the user or check documentation

### Code Review Checklist

When reviewing or creating styled components:

- [ ] Uses CSS variables from core.css (not hard-coded values)
- [ ] Follows established component patterns (Tabs, forms, buttons)
- [ ] Uses standard class names (`.tab-heads`, `.input`, `.form`, etc.)
- [ ] Uses BEM-style modifiers (`.-active`, `-primary`, `-error`, etc.)
- [ ] No inline styles unless absolutely necessary
- [ ] Mobile-responsive (uses CSS variables and media queries)

## Documentation

All docs live in `docs/`; **[`docs/README.md`](docs/README.md) is the index and status board** (Implemented / Partial / Pending / Obsolete). Every doc starts with a status block — check it before trusting a doc, and update it when you change the code it describes. Folders: `architecture/` (how it works), `features/` (shipped features), `plans/` (not built yet), `research/`, `security/`, `compliance/`, `guides/`, `archive/` (obsolete — do not follow).

Most used: `DESIGN.md` (root, design tokens), `docs/security/CRYPTOGRAPHY.md`, `docs/architecture/import/IMPORT.md`, `docs/features/chat/CHAT.md`, `docs/features/careplan/CAREPLAN.md`, `docs/features/plugin/ENGINEERING.md`.

## Important Notes

- The application handles sensitive medical data - always maintain security best practices
- Real-time features depend on proper session state management via EventEmitter + SSE
- Medical configurations in `src/lib/configurations/` define structured data schemas
- Audio processing requires proper microphone permissions and VAD integration
- All medical analysis follows structured schemas with confidence scoring (0.0-1.0 scale)
- Use the centralized logging system (`logger.session`, `logger.analysis`) for consistent debugging
- Always validate AI provider responses and implement proper fallback mechanisms
- Model new medical data structures on FHIR resources where one fits
- **CRITICAL**: Use Svelte 5 runes syntax throughout - `$state()`, `$props()`, `$bindable()` required
- **Store Management**: Prefer Svelte stores over `$effect()`/`$derived()` for shared state

### Never cut (simplicity never applies to these)

- Validation at trust boundaries (API input, AI output, imported files)
- Encryption — plaintext medical data never reaches the server or logs
- RLS policies and auth guards (`safeGetSession`) on every new table/endpoint
- `auditFromEvent` on endpoints that touch documents, profiles, shares, imports, sessions
- Data-loss handling (failed saves, partial imports, interrupted uploads)
- Accessibility (labels, keyboard) and i18n (`$t()` keys, never hardcoded text)
