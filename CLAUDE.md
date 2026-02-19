# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Available tools:
- `qmd search “query”` - fast keyword search (BM25)
- `qmd query “query”` - hybrid search with reranking (best quality)
- `qmd vsearch “query”` - semantic vector search
- `qmd get <file>` - retrieve a specific document

Use qmd search for quick lookups and qmd query for complex questions.

Use Read/Glob only if qmd doesn’t return enough results.
Once this is in place, Claude will always search the index first. It will only fall back to reading full files when it genuinely can’t find what it needs through the
index.

## Architecture Overview

### Main Application Structure

- **Authentication**: Supabase-based auth with session management via `src/lib/auth.ts` and `src/hooks.server.ts`
- **Real-time Sessions**: In-memory session store with EventEmitter updates via `src/lib/session/manager.ts`
- **AI Analysis**: Multi-provider AI integration (GPT, Gemini) for medical conversation analysis
- **Audio Pipeline**: Real-time transcription with Voice Activity Detection, MP3 encoding, and multiple transcription providers
- **Medical Data**: FHIR-compliant health records with comprehensive medical configurations
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
- **FHIR Compliance**: All medical data follows healthcare interoperability standards
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

- **LangChain** ecosystem (@langchain/core, @langchain/openai, @langchain/anthropic, @langchain/google-genai)
- **LangGraph** (@langchain/langgraph) for orchestrating complex AI workflows
- **OpenAI GPT-4** as primary AI provider with multi-provider fallback support
- **AssemblyAI** and **Google Speech SDK** for audio transcription
- **Whisper** integration for offline transcription capabilities

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
  const data = await apiFetch('/v1/med/user', { fetch });
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
  const data = await apiFetch('/v1/med/profiles', fetchOpts);
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

- **YAML-based config**: AI models defined in `src/lib/config/models.yaml`
- **Provider abstraction**: Support for OpenAI, Google, Anthropic with fallback chains
- **Flow-specific models**: Different models for extraction, analysis, feature detection, etc.
- **Cost optimization**: Automatic model selection based on task complexity

### Medical Configuration Schema

- **FHIR compliance**: All medical data structures follow FHIR standards
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

## Performance & Optimization

### Build Configuration

- **Vite optimization**: Custom excludes for ONNX runtime and large dependencies
- **Static copying**: Automatic copying of WASM files and worker scripts
- **Code splitting**: Lazy loading for heavy components and AI models
- **Bundle analysis**: Optimized imports and tree shaking

### Runtime Performance

- **Lazy loading**: PDF.js and other heavy libraries loaded on demand
- **Worker threads**: Audio processing and VAD in web workers
- **Caching strategies**: Local storage caching for frequently accessed data
- **Memory management**: Proper cleanup of event listeners and subscriptions

## Error Handling & Logging

### Centralized Logging

- **Namespace-based logging**: Organized by feature (Session, Audio, Analysis, etc.)
- **Environment awareness**: Different log levels for development vs production
- **Runtime configuration**: Logging configurable via `window.logger` object
- **Structured logging**: Consistent format with timestamps and context

### Error Handling Patterns

- **Type-safe errors**: Standardized error interfaces with proper HTTP status codes
- **Graceful degradation**: Fallback mechanisms for AI provider failures
- **User feedback**: Clear error messages with actionable guidance
- **Monitoring**: Error tracking with detailed context for debugging

## Development Workflow

### Code Quality

- **Pre-commit hooks**: Automated formatting and linting
- **Type checking**: Strict TypeScript compilation with `svelte-check`
- **Test coverage**: Unit and integration tests with clear separation
- **Documentation**: Comprehensive inline documentation for complex logic

### Deployment

- **Vercel deployment**: Automatic deployments with preview environments
- **Environment management**: Separate staging and production configurations
- **Performance monitoring**: Built-in analytics and performance tracking
- **Health checks**: Automated monitoring of critical endpoints

## Chat System

- **Library**: `src/lib/chat/` - Chat manager, AI service, client service, tool executor, MCP wrapper, store
- **Components**: `src/components/chat/` - AIChatSidebar, ContextPrompt
- **API**: `src/routes/v1/chat/conversation/+server.ts`
- **Context Assembly**: `src/lib/context/` - Context composer, MCP tools, integrations
- For detailed context, use the `@chat` command. Reference: `AI_CHAT.md`

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
- Reference: `docs/CONTEXT_MANAGEMENT_SYSTEM.md`, `CONTEXT_DEVELOPMENT_STRATEGY.md`

## Audio / Transcription Pipeline

- **Core Audio**: `src/lib/audio/` - AudioManager, microphone, streaming transcription
- **Session Audio**: `src/lib/session/audio/` - Audio processing, VAD helpers, microphone utils
- **Providers**: AssemblyAI, Google Speech SDK, Deepgram, Whisper
- Reference: `TRANSCRIPTION.md`

## Mobile / Capacitor Development

- **Config files**: `capacitor.config.ts`, `vite.config.mobile.ts`, `svelte.config.mobile.js`, `src/app.mobile.html`
- **Platform adapters**: `src/lib/capacitor/auth.ts`, `src/lib/device.ts`
- **Native directories**: `android/`, `ios/`, `mobile/`
- For detailed context, use the `@mobile` command. Reference: `RESPONSIVE.md`

## Session Development

For session development context, use the `@session` command. Key references: `AI_SESSION_WORKFLOW.md`, `AI_SESSION_QOM.md`, `AI_SESSION_ANALYSIS.md`

## CSS Architecture & Styling Guidelines

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

**Always use these variables instead of hard-coded values:**

```css
/* Spacing */
--ui-pad-small: 0.5rem
--ui-pad-medium: 1rem
--ui-pad-large: 1.5rem
--ui-pad-xlarge: 2rem

/* Radius */
--ui-radius-small: 0.25rem
--ui-radius-medium: 0.5rem
--ui-radius-large: 1rem

/* Colors */
--color-surface: /* Light background */
--color-border: /* Border color */
--color-text-primary: /* Main text */
--color-text-secondary: /* Muted text */
--color-positive: /* Success */
--color-negative: /* Error */
--color-warning: /* Warning */
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

## Documentation Index

| File | Purpose |
|------|---------|
| `AI_CHAT.md` | Chat system architecture and design |
| `AI_IMPORT_USER_CONFIGURATION.md` | Import schema user configuration |
| `AI_RESEARCH.md` | AI research notes |
| `AI_SESSION_ANALYSIS.md` | Session analysis pipeline |
| `AI_SESSION_QOM.md` | QOM expert pipeline architecture |
| `AI_SESSION_WORKFLOW.md` | Full session AI workflow phases |
| `AI_TODO.md` | AI development TODO items |
| `CONTEXT_DEVELOPMENT_STRATEGY.md` | Context assembly roadmap |
| `DATA_AND_PRIVACY.md` | Data handling and privacy policies |
| `LOGGER_MIGRATION_GUIDE.md` | Logger migration instructions |
| `LOGGER_EXAMPLE_MIGRATION.md` | Logger migration examples |
| `MARKETING.md` | Marketing content |
| `RESPONSIVE.md` | Mobile responsive patterns and breakpoints |
| `TRANSCRIPTION.md` | Audio transcription providers and setup |
| `docs/BETA_ACCESS_SYSTEM.md` | Beta access management |
| `docs/CLINICAL_DATA_PLATFORM.md` | Clinical data platform design |
| `docs/CONTEXT_MANAGEMENT_SYSTEM.md` | Context assembly system documentation |
| `docs/IMPORT.md` | Import architecture documentation |
| `docs/README.md` | Documentation index |
| `src/routes/med/FEATURES.md` | Medical features documentation |
| `src/components/apps/README.md` | Apps component documentation |
| `3D_TEXTURES.md` | 3D texture pipeline: Blender prep, glTF export, Three.js integration |

## Important Notes

- The application handles sensitive medical data - always maintain security best practices
- Real-time features depend on proper session state management via EventEmitter + SSE
- Medical configurations in `src/lib/configurations/` define structured data schemas
- Audio processing requires proper microphone permissions and VAD integration
- All medical analysis follows structured schemas with confidence scoring (0.0-1.0 scale)
- Use the centralized logging system (`logger.session`, `logger.analysis`) for consistent debugging
- Always validate AI provider responses and implement proper fallback mechanisms
- Follow FHIR standards for all medical data structures and transformations
- **CRITICAL**: Use Svelte 5 runes syntax throughout - `$state()`, `$props()`, `$bindable()` required
- **Store Management**: Prefer Svelte stores over `$effect()`/`$derived()` for shared state
