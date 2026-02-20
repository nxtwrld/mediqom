# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the SvelteKit app. `routes/` maps directly to pages and endpoints; `lib/` holds reusable services, stores, and utilities; `components/` is for shared UI.
- `assets-src/` stores raw design assets before optimization; processed static files go in `public/` while `static/` is served as-is by SvelteKit.
- `supabase/` and `config/` capture environment-specific settings; update `.env.local` to point at the right Supabase project when running locally.
- Integration and E2E helpers live under `tests/` and `test-data/`; feature-specific fixtures belong next to the feature in `src/content` or `src/data`.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite dev server with hot reloading.
- `npm run build` creates the production bundle; verify before deploys.
- `npm run preview` serves the built bundle locally for smoke tests.
- `npm run lint` runs Prettier (check mode) and ESLint; fix issues with `npm run format`.
- `npm run check` runs `svelte-check` with the repo TypeScript config.
- `npm run test` executes `test:integration` (Playwright) and `test:unit` (Vitest); run the granular scripts for quicker feedback.

## Coding Style & Naming Conventions

- TypeScript and Svelte files use 2-space indentation; rely on Prettier defaults.
- Name Svelte components with PascalCase (`UserMenu.svelte`) and utility modules with camelCase filenames.
- Co-locate scoped styles inside `Component.svelte`; share global styles through `src/css/`.
- Prefer explicit exports from `src/lib` so routes import through `$lib/...` for clarity.

## Testing Guidelines

- Write unit tests with Vitest; place them beside the code as `*.test.ts`.
- Add Playwright specs in `tests/` using filenames that mirror the user flow (`signup.spec.ts`); run with `npm run test:integration -- --ui` when debugging.
- Keep fixtures under `test-data/` and clean them after test runs; avoid hardcoding Supabase credentials.
- Ensure new features have at least one automated test and update snapshots when UI changes.

## Commit & Pull Request Guidelines

- Follow the existing short imperative commit style (`Color fix`, `Switching to SSE by default`); limit to one focused change per commit.
- Reference related issues in the body and note any follow-up tasks.
- PRs should include a concise summary, testing evidence (command output or screenshots), and call out risk areas or manual verification steps.
- Tag reviewers familiar with the affected module and link design docs or Supabase migration notes when relevant.
