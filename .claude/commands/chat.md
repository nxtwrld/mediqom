# AI Chat System

We are working on the AI-powered medical chat system with context-aware responses.

$ARGUMENTS

## Architecture

The chat system provides AI-assisted medical conversations with access to patient health data through a context assembly pipeline and MCP tool integration.

## Library (`src/lib/chat/`)

- `chat-manager.ts` - Core chat orchestration, manages conversation lifecycle
- `ai-service.ts` - AI provider integration (OpenAI, Anthropic) for generating responses
- `client-service.ts` - Client-side chat service managing UI state and server communication
- `client-tool-executor.ts` - Executes AI tool calls on the client side
- `mcp-tool-wrapper.ts` - Wraps MCP tools for AI model consumption
- `anatomy-integration.ts` - Bridges chat with 3D anatomy visualization
- `store.ts` - Svelte store for chat UI state
- `types.d.ts` - TypeScript type definitions
- `index.ts` - Public exports

## Context Assembly (`src/lib/context/`)

- `context-assembly/context-composer.ts` - Assembles patient medical context for AI
- `context-assembly/token-optimization.ts` - Optimizes context to fit model token limits
- `integration/chat-service.ts` - Chat-specific context integration
- `integration/session-context.ts` - Session-specific context integration
- `integration/profile-context.ts` - Patient profile context
- `integration/client/chat-context-client.ts` - Client-side context provider
- `integration/server/chat-context-server.ts` - Server-side context provider
- `integration/shared/chat-context-base.ts` - Shared context logic
- `integration/system-check.ts` - Context system health check
- `integration/validation.test.ts` - Context validation tests
- `mcp-tools/medical-expert-tools.ts` - MCP tools for medical document search
- `mcp-tools/tools/` - Individual tool implementations (search-documents, get-assembled-context, get-document-by-id, get-patient-timeline, get-profile-data, query-medical-history)
- `mcp-tools/security-context-builder.ts` - Security-scoped context building
- `mcp-tools/security-audit.ts` - Security audit for tool access
- `types.ts` - Context type definitions
- `objects.ts` - Context data objects

## UI Components (`src/components/chat/`)

- `AIChatSidebar.svelte` - Main chat sidebar panel
- `ContextPrompt.svelte` - Context-aware prompt display

## API Routes

- `src/routes/v1/chat/conversation/+server.ts` - Chat conversation endpoint

## Documentation

- `AI_CHAT.md` - Chat system architecture and design
- `docs/CONTEXT_MANAGEMENT_SYSTEM.md` - Context assembly system documentation
- `CONTEXT_DEVELOPMENT_STRATEGY.md` - Context development roadmap
- `src/lib/context/mcp-tools/SECURITY_USAGE.md` - MCP tool security guidelines

## Key Patterns

- **Dual-mode**: Chat works both standalone and within active sessions
- **Context-aware**: Automatically assembles relevant patient medical history
- **Tool-augmented**: AI can invoke MCP tools to query health data
- **Streaming**: Responses streamed via SSE for real-time display
- **Security**: Context builder enforces data access boundaries
