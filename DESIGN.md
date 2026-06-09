---
# Mediqom DESIGN.md — machine-readable design tokens.
# Follows the open Google Stitch DESIGN.md format (YAML front matter + prose).
# SOURCE OF TRUTH: src/css/core.css. These tokens MIRROR that file; if they
# ever disagree, core.css wins. Update both together.
name: Mediqom
description: >-
  Privacy-first medical records explorer and consultation-analysis platform.
  Calm clinical clarity: trustworthy, legible, information-dense without clutter.
  Full light/dark parity is mandatory.

colors:
  # Canonical role tokens (use these; never raw hex in components).
  # Each has -text (foreground), -light (pale tint bg), -dark (deeper shade),
  # and -rgb (triplet for rgba()) where defined in core.css.
  interactivity: "#3571ff" # brand blue — primary actions, links, focus, selection
  interactivity-dark: "#2756cc"
  interactivity-light: "#e8f0ff"
  positive: "#29cc97" # green — success / confirmation / "yes"
  negative: "#fb104a" # red — destructive / error ONLY
  warning: "#fec400" # yellow — caution / low-urgency flags
  info: "#a989ee" # purple — informational
  highlight: "#a989ee" # purple — emphasis / highlighted items
  neutral: "#3571ff" # = blue, neutral emphasis
  # Surfaces & text
  surface: "#f9fafb" # panels / cards
  background: "#e6e7ea" # element backgrounds
  page: "#d0d1d7" # body background
  border: "#f9fafb"
  text-primary: "#252733"
  text-secondary: "#9fa2b4" # muted / label text (use --color-text-secondary)
  # Grayscale ramp (low→high lightness)
  black: "#252733"
  gray-900: "#464957"
  gray-800: "#9fa2b4"
  gray-700: "#6b6e7d"
  gray-600: "#bdbec5"
  gray-500: "#d0d1d7"
  gray-400: "#e0e0e3"
  gray-300: "#e6e7ea"
  gray-200: "#e9eaed"
  gray-100: "#f2f3f5"
  white: "#f9fafb"

fontSize: # --font-size-* scale
  xs: "0.75rem"
  sm: "0.875rem"
  base: "1rem"
  lg: "1.25rem"
  xl: "1.4rem"
  2xl: "1.6rem"

typography:
  body: { family: "Mulish", weight: 300, weights: "200-1000 (variable)" }
  heading: { family: "Fira Sans", weights: "600, 700" }
  values: { family: "Roboto Mono", note: "numbers, codes, units" }
  cursive: { family: "Caveat", note: "hints / annotations only" }
  scale:
    h1: { size: "1.8rem", weight: 700, mobile: "1.5rem" }
    h2: { size: "1.6rem", weight: 700, mobile: "1.5rem" }
    h3: { size: "1.4rem", weight: 600, mobile: "1.25rem" }
    h4: { size: "1.25rem", weight: 600, mobile: "1.1rem" }
    body: { lineHeight: "1.3rem" }

spacing:
  # --ui-pad-* scale (4px base step)
  xsmall: "0.25rem" # 4px
  small: "0.5rem" # 8px
  medium: "1rem" # 16px
  large: "1.5rem" # 24px
  xlarge: "2rem" # 32px
  gap: "2px" # --gap, the tight grid gap between cells
  height-unit: "min(3rem, 50px)" # touch-target base for bars/actions

radius:
  small: "0.25rem" # --ui-radius-small / 4px
  medium: "0.5rem" # --ui-radius-medium / 8px
  large: "1rem" # --ui-radius-large / 16px
  r8: "min(0.5rem, 10px)" # --radius-8
  r12: "min(0.75rem, 15px)" # --radius-12
  r16: "min(1rem, 20px)" # --radius-16 (default --radius)
  r24: "min(2rem, 40px)" # --radius-24 (modals)

shadows:
  interactivity: "0 0.3rem 0.2rem -0.2rem rgba(0,0,0,0.1)"
  modal: "0 2rem 2rem -0.75rem rgba(0,0,0,0.2)"

zIndex: # named layers — never use raw integers; values mirror the live hierarchy
  base: 1
  content: 2
  sticky: 10
  dropdown: 100
  chrome: 1000 # headers, sidebars, nav, floating buttons
  overlay: 100000 # full-screen backdrops, search, viewer
  modal: 100001
  popover: 100002
  app: 10000000 # embedded apps

breakpoints: # px VALUES (CSS vars can't be used in @media — see Layout)
  mobile: 480
  tablet: 768 # primary mobile/desktop split
  desktop: 1024
  container: [300, 400, 600] # for @container queries on document sections
---

# Mediqom Design System

> **For AI agents:** This file defines how Mediqom looks and feels. Treat the
> token values as hard constraints. The source of truth is
> [`src/css/core.css`](src/css/core.css) (CSS custom properties) plus the global
> stylesheets in `src/css/`; this document explains **why** and **when**. When
> you write UI, reach for an existing component and a token before writing new
> CSS. The project also enforces the rules in `CLAUDE.md` (§CSS Architecture).

## Overview

Mediqom is a privacy-first platform where patients and clinicians explore
encrypted medical records and analyze doctor–patient consultations in real time.

**Design intent — "calm clinical clarity":**

- **Trustworthy & quiet.** Medical data is serious. The UI recedes so the data
  leads. No decorative noise, no gratuitous color.
- **Legible & dense.** Clinicians scan a lot of structured data. Favor clear
  hierarchy, generous line-height, and compact-but-breathable layouts over
  whitespace-heavy marketing aesthetics.
- **Semantic color, sparingly.** Color carries meaning (urgency, status,
  success/error). Never use a status color decoratively.
- **Light/dark parity is mandatory.** Every surface must work in both themes.
  Never hard-code a light-only color — always use a token (which flips
  automatically via `[data-theme="dark"]`).
- **Rounded, soft surfaces.** Cards, inputs, and modals use generous radii.

When no rule below covers a decision, default to: *what keeps the data readable
and the chrome quiet?*

## Colors

Components reference **role tokens** (`--color-interactivity`,
`--color-negative`, …), which point at an underlying literal palette
(`--color-blue`, `--color-red`, …). The literals shift in dark mode, so the role
tokens stay correct automatically.

> **One vocabulary.** Use the role tokens below. Do **not** invent alternates
> (`--color-primary`, `--color-success`, `--color-danger`, `--color-error`,
> `--color-blue-600`, `--space-4`, `--font-size-small`, …). They are not defined
> and will silently fail. Earlier drift along those lines has been removed.

### Roles (canonical API — use these)

| Token | Light | Use |
| --- | --- | --- |
| `--color-interactivity` | `#3571ff` | Primary actions, links, focus, selection |
| `--color-positive` | `#29cc97` | Success, confirmation, "yes" |
| `--color-negative` | `#fb104a` | Destructive actions & errors **only** |
| `--color-warning` | `#fec400` | Caution, low-urgency flags |
| `--color-info` | `#a989ee` | Informational |
| `--color-highlight` | `#a989ee` | Emphasis / highlighted items |
| `--color-neutral` | `#3571ff` | Neutral emphasis (= blue) |

Variants (defined in `core.css`, theme-aware):
- `-text` — foreground/contrast color to place **on** the role color
  (e.g. `--color-negative-text`).
- `-light` — pale tint for subtle backgrounds (e.g. `--color-positive-light`).
- `-dark` — deeper shade for text/icons on light backgrounds
  (e.g. `--color-negative-dark`).
- `-rgb` — `r,g,b` triplet for `rgba()`, e.g.
  `rgba(var(--color-negative-rgb), 0.1)`.

(`-light`/`-dark`/`-rgb` exist for `positive`/`negative`/`warning`/`info`/
`interactivity`.)

### Surfaces & text

| Token | Use |
| --- | --- |
| `--color-surface` | Cards, panels, raised content |
| `--color-background` | Element backgrounds within a page |
| `--background` | Page body (darkest layer in dark mode) |
| `--color-border` | Borders / dividers |
| `--color-text-primary` | Body text |
| `--color-text-secondary` | Muted / secondary / label text |

### Grayscale ramp

`--color-black`, `--color-gray-900/800/700/600/500/400/300/200/100`,
`--color-white` (low→high lightness). `*-alpha` variants exist for translucent
fills. All invert under `[data-theme="dark"]`.

### Categorical & medical scales

- **`--color-categ1-1…10`** — pastel palette for charts/tags (distinct hues).
- **`--color-categ2-1…30`** — 30-step signal palette for dense data viz.
- **Urgency:** `--color-urgency-low/medium/high` and classes
  `.urgency-1…5` (low→high = positive→danger).
- **Severity:** `.severity-low/moderate/severe` and `.-mild/.-moderate/.-severe`.
- **Categories:** `.category-*` (exam, lab, therapy, medication, imaging, …) —
  defined in `src/css/categories.css`.

> Some category colors are currently hard-coded literals in
> `src/css/categories.css` — migrate those to tokens when touched.

## Typography

Loaded via `src/css/fonts.css` (WOFF2, `font-display: swap`):

| Token | Font | Use |
| --- | --- | --- |
| `--font-face` | **Mulish** (variable 200–1000) | All body text (default weight 300) |
| `--font-face-heading` | **Fira Sans** (600/700) | Headings |
| `--font-face-values` | **Roboto Mono** | Numbers, codes, units, monospace |
| `--font-face-cursive` | **Caveat** | Hints / annotations only |

**Heading scale** — use the `.h1`–`.h4` classes (or semantic `<h1>`–`<h4>`),
which already apply the right family, weight, and a responsive size step at
≤768px. `.value` / `.unit` render in Roboto Mono. Links use
`--color-interactivity` at weight 600. Bold = `700` (`--text-bold`).
The `--font-size-*` scale (`xs` 0.75 · `sm` 0.875 · `base` 1 · `lg` 1.25 ·
`xl` 1.4 · `2xl` 1.6 rem) is available for non-heading text.

## Layout & Spacing

- **Spacing scale:** `--ui-pad-xsmall/small/medium/large/xlarge`
  (4/8/16/24/32px). Use these for padding and margins; `--gap` (2px) is the
  tight grid gap.
- **Touch targets:** bars, headings, and actions are sized from
  `--ui-height-unit` (`min(3rem, 50px)`) — reuse `--toolbar-height`,
  `--action-height`, `--input-height` (2.5rem) rather than inventing heights.
- **Utilities:** `.flex`, `.flex.-column`, `.flex.-center` for quick flex
  layouts; `.page`, `.heading`, `.toolbar` for app-shell structure.
- **Safe areas:** `--safe-area-top/right/bottom/left` for notch handling.

### Breakpoints

Canonical viewport breakpoints: **480 / 768 / 1024 px**. `768px` is the primary
mobile↔desktop split. Container queries on document sections use **300 / 400 /
600 px**.

> ⚠️ **CSS custom properties cannot be used inside `@media` conditions.** The
> `breakpoints` in the front matter are documentation constants — write the
> literal px value in the media query, but use **only** the canonical set above.
> Don't introduce new breakpoints (640/600/500/800 are legacy and being
> consolidated to 768).

## Elevation & Depth

- **Shadows:** `--shadow-interactivity` (subtle lift for interactive elements)
  and `--shadow-modal` (dialogs). Don't hand-roll `box-shadow` — use these.
- **Z-index:** use the named scale, never raw integers. Values mirror the
  app's existing layering so they're drop-in safe:
  `--z-base (1) → --z-content (2) → --z-sticky (10) → --z-dropdown (100) →
  --z-chrome (1000) → --z-overlay (100000) → --z-modal (100001) →
  --z-popover (100002) → --z-app (10000000)`.

## Shapes

Rounded everything. Pick by element size:
`--ui-radius-small` (4px, chips/badges) · `--ui-radius-medium` (8px, inputs/
buttons) · `--radius-12` (15px) · `--radius-16` (default, cards) · `--radius-24`
(modals). Generic alias: `--radius` = `--radius-16`.

## Motion

`--transition-fast (0.15s)` · `--transition-default (0.2s)` ·
`--transition-slow (0.3s)`. Use for hovers, panel slides, and state changes.
Keep motion subtle — this is a medical tool, not a game.

## Components

Reusable primitives live in `src/components/forms/` and `src/components/ui/`.
**Prefer these over raw HTML elements.** Below: purpose, key props/classes, one
example, and when to use. See the component files for full prop lists.

### Buttons (`.button` + modifiers)

CSS-class component (no Svelte wrapper). Compose with modifiers.

```svelte
<button class="button -primary">Save</button>
<button class="button -danger -small" onclick={remove}>Delete</button>
```

Modifiers: `-primary` (filled blue) · `-danger` · `-highlight` (purple) ·
`-accept`/`-suppress` · `-large`/`-small` · decision states `-yes`/`-no`/
`-unknown`/`-acknowledged`. Group with `.buttons-row` (end-aligned) or
`.form-actions`. **Always** use `.button`; never style a bare `<button>` as a
primary action.

### Input (`$components/forms/Input.svelte`)

One component for ~13 input types (text, email, password, number, date, time,
checkbox, radio, …). Handles label, password reveal, copy-to-clipboard.

```svelte
<Input type="email" label={$t('account.email')} bind:value={email} required />
```

Key props: `type`, `label`, `bind:value` (or `bind:checked` for checkbox/radio),
`placeholder`, `required`, `disabled`, `readonly`, `viewable` (password eye),
`copyable`. **Use this for every form field** — do not write raw `<input>`.

### Select / Textarea / specialized inputs

- **`Select`** — `bind:value`, `options: {key, value}[]`, `label`, `multiple`.
- **`Textarea`** — auto-growing; `bind:value`, `label`, `resizable`, `size`.
- **`InputDateTime`** (date/time with TZ handling), **`InputRange`**,
  **`InputFile`**, **`Autocomplete`** — use instead of raw equivalents.

### Forms (`.form` + `.input`)

```svelte
<form class="form">
  <Input label={$t('profile.name')} bind:value={name} />
  <Select label={$t('profile.type')} options={types} bind:value={type} />
  <div class="form-actions">
    <button class="button -primary" type="submit">{$t('app.save')}</button>
  </div>
</form>
```

`.form` (max-width 35rem) · `.form-actions` (end-aligned button row) ·
`.input.-error` for the error state.

### Modal (`$components/ui/Modal.svelte`)

```svelte
<Modal onclose={() => (show = false)}>
  <h3 class="h3">{$t('confirm.title')}</h3>
  <!-- content -->
</Modal>
```

Props: `onclose`, `type: 'default' | 'fullscreen'`, `style`. Handles overlay,
Escape, outside-click, focus trap, transitions. Exposes `closeModal()`.

### Tabs (`Tabs` + `TabHeads` + `TabHead` + `TabPanel`)

Context-based composition with optional sliding fixed-height mode.

```svelte
<Tabs fixedHeight>
  {#snippet tabHeads()}
    <TabHeads>
      <TabHead id="overview">{$t('tab.overview')}</TabHead>
      <TabHead id="history">{$t('tab.history')}</TabHead>
    </TabHeads>
  {/snippet}
  <TabPanel id="overview"><!-- … --></TabPanel>
  <TabPanel id="history"><!-- … --></TabPanel>
</Tabs>
```

For route-based tabs use `<nav class="tab-heads">` with `<a class:-active>`.

### Feedback: Loading / ProgressBar / Empty

- **`Loading`** — `type: 'big' | 'line' | 'small'`, optional children caption.
- **`ProgressBar`** — `value`, `max`, optional `offset`. Inherits `currentColor`.
- **`Empty`** — empty-state placeholder; defaults to `$t('links.no-items')`.

### Popover (`$components/ui/Popover.svelte`)

Smart-positioned menu/tooltip with auto-flip and arrow. `bind:open`,
`placement: 'top' | 'bottom'`, `trigger` + `children` snippets, or absolute
`x`/`y` for chart contexts.

### Data display

- **`.table-list`** — standard table; `.-mobile-list` stacks rows as cards
  ≤768px; `.actions` cell for icon buttons.
- **`.tiles` / `.tile`** — responsive auto-fill grid of cards (`.-fit`,
  `.-vertical` variants).
- **`.tag`** — inline label; `.-object` (blue), `.-highlight` (purple).
- **`Prop`** — key/value display row (icon + label + value + units).
- **`LinkedItem` / `LinkedItems`** — linked-record cards (`rows`/`icons` layout).
- **`Markdown`** — safe Markdown→HTML (marked + DOMPurify), responsive tables.

### App shell

`.page` (scrolling content area; `.-empty`/`.-block`/`.-raw` variants) ·
`.heading` (sticky title bar with `.actions`/`.toolbar`) · `.toolbar` (icon/
action row with `.spacer`). `.overlay` is the full-screen backdrop (blur,
`--z-overlay`).

### Icons

SVG sprites in `static/`: `icons.svg`, `icons-o.svg` (outline), `files.svg`.

```svelte
<svg><use href="/icons.svg#icon-name"></use></svg>
```

Add sources to `assets-src/` and regenerate with `node svgToSprite.js`. Use
`href`, not `xlink:href`.

## Do's and Don'ts

**Color**
- ✅ Use the role tokens (`--color-interactivity`, `--color-negative`,
  `--color-positive`, `--color-warning`, `--color-info`, `--color-highlight`)
  and their `-text`/`-light`/`-dark`/`-rgb` variants.
- ❌ Never invent alternate names (`--color-primary`, `--color-success`,
  `--color-danger`, `--color-error`, `--color-blue-600`, `--color-text-muted`,
  `--space-*`, `--font-size-small`, …) — they're undefined and fail silently.
- ❌ Never hard-code hex/rgb in a component. ❌ Never use a status color
  decoratively (`--color-negative` is errors/destruction only).
- ❌ Never use a light-only color that breaks dark mode — tokens flip for you.

**Spacing, radius, shadow, z-index, motion**
- ✅ Use `--ui-pad-xsmall/small/medium/large/xlarge` (4/8/16/24/32px),
  `--ui-radius-*`/`--radius-*`, `--shadow-*`, `--z-*`, `--transition-*`,
  `--font-size-*`.
- ❌ No magic numbers (`padding: 13px`, `z-index: 9999`, ad-hoc `box-shadow`).

**Components**
- ✅ Use `Input`/`Select`/`Textarea`/`InputDateTime` for every form field.
- ❌ Never write a raw `<input>`/`<select>`/`<textarea>` in a feature component.
- ✅ Use `.button` + modifiers for actions. ✅ Use the `Tabs` system, `Modal`,
  `.table-list`, `.tiles` rather than re-implementing them.

**Layout**
- ✅ Use only the canonical breakpoints (480/768/1024; containers 300/400/600).
- ❌ No new breakpoints. Remember breakpoints are literal px (not CSS vars).

**Svelte**
- ✅ Svelte 5 runes (`$state`, `$props`, `$bindable`). ✅ Extract event handlers
  to named functions (no multiline logic in `onclick=`).
- ✅ All user-facing text through `$t()` (i18n).

## References

- `src/css/core.css` — token source of truth
- `src/css/` — global component stylesheets (buttons, forms, tabs, tables, …)
- `src/components/forms/`, `src/components/ui/` — reusable primitives
- `CLAUDE.md` §"CSS Architecture & Styling Guidelines" — enforced rules
- `RESPONSIVE.md` — mobile/responsive strategy
- DESIGN.md format: <https://github.com/google-labs-code/design.md>
