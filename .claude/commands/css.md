# CSS Architecture Reference

Quick reference for the project's CSS variable system, naming conventions, and file organization.

$ARGUMENTS

## CSS File Map (`src/css/`)

Loaded via `index.css` in this order:

| File             | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `fonts.css`      | Web font imports (Mulish, Fira Sans, Roboto Mono, Caveat)          |
| `reset.css`      | Browser reset / normalization                                      |
| `core.css`       | CSS custom properties (colors, fonts, sizing, shadows, safe areas) |
| `typography.css` | Text styles, headings, paragraph defaults                          |
| `layouts.css`    | Layout primitives, flex/grid helpers                               |
| `flags.css`      | Country/language flag icons                                        |
| `overlay.css`    | Overlay and backdrop styles                                        |
| `forms.css`      | Form elements (inputs, selects, textareas)                         |
| `buttons.css`    | Button base + variants (`.button.-primary`, `.-danger`, etc.)      |
| `toolbars.css`   | Toolbar layout and spacing                                         |
| `modal.css`      | Modal dialog styles                                                |
| `pages.css`      | Page-level layout containers                                       |
| `headings.css`   | Section heading styles                                             |
| `tabs.css`       | Tab navigation components                                          |
| `tables.css`     | Table styles                                                       |
| `tags.css`       | Tag/chip components                                                |
| `tiles.css`      | Tile/card components                                               |
| `categories.css` | Medical category color classes                                     |
| `documents.css`  | Document viewer styles                                             |
| `session.css`    | Session visualization (Sankey nodes, links, badges, animations)    |

Additional: `app.css` (app-level overrides, not in index.css import chain).

## Core Variables (`src/css/core.css`)

### Colors — Palette

```css
--color-blue: #3571ff --color-purple: #a989ee --color-reglight: #ff6f93
  --color-red: #fb104a --color-yellow: #fec400 --color-green: #29cc97;
```

### Colors — Grayscale

```css
--color-black: #252733 --color-gray-900: #464957 --color-gray-800: #9fa2b4
  --color-gray-600: #bdbec5 --color-gray-500: #d0d1d7 --color-gray-400: #e0e0e3
  --color-gray-300: #e6e7ea --color-white: #f9fafb;
```

Alpha variants: `--color-gray-800-alpha`, `--color-gray-500-alpha`, `--color-gray-400-alpha`, `--color-gray-300-alpha` (hex + `7c` alpha).

### Colors — Semantic Aliases

```css
--color-positive: var(--color-green) /* Success, accept */
  --color-negative: var(--color-red) /* Error, danger */
  --color-neutral: var(--color-blue) /* Informational */
  --color-warning: var(--color-yellow) /* Warnings */
  --color-info: var(--color-purple) /* Info/highlight */
  --color-interactivity: var(--color-blue) /* Interactive elements */
  --color-highlight: var(--color-purple) /* Highlights */;
```

Each has a matching `*-text` variant (e.g. `--color-positive-text: var(--color-white)`).

### Colors — Urgency Scale

```css
--color-urgency-low: var(--color-warning)
  --color-urgency-medium: var(--color-redlight)
  --color-urgency-high: var(--color-negative);
```

### Typography

```css
--font-face:
  "Mulish", sans-serif /* Body text */ --font-face-heading: "Fira Sans",
  sans-serif /* Headings */ --font-face-values: "Roboto Mono",
  monospace /* Numeric/code */ --font-face-cursive: "Caveat",
  cursive /* Handwritten */ --font-face-system: system-ui,
  ... /* System fallback */ --font-face-print: "Verdana", sans-serif /* Print */;
```

### Sizing

```css
--ui-height-unit: min(3rem, 50px) /* Base unit */
  --toolbar-height: var(--ui-height-unit)
  --heading-height: var(--ui-height-unit) --action-height: var(--ui-height-unit)
  --action-height-icon: calc(var(--ui-height-unit) - 1.5rem)
  --input-height: 2.5rem --gap: 2px --text-padding: min(1rem, 20px);
```

### Border Radius

```css
--radius-8: min(0.5rem, 10px) --radius-16: min(1rem, 20px)
  --radius-24: min(2rem, 40px);
```

### Shadows

```css
--shadow-interactivity: 0 0.3rem 0.2rem -0.2rem rgba(0, 0, 0, 0.1)
  --shadow-modal: 0 2rem 2rem -0.75rem rgba(0, 0, 0, 0.2);
```

### Button Variables

Default:

```css
--button-color: var(--color-gray-300)
  --button-border-color: var(--color-gray-800)
  --button-border-color-hover: var(--color-black)
  --button-text-color: var(--color-black);
```

Primary:

```css
--button-color-primary: var(--color-blue)
  --button-border-color-primary: var(--color-blue)
  --button-text-color-primary: var(--color-white);
```

### Safe Area (Notch Insets)

```css
--safe-area-top: env(safe-area-inset-top, 0px)
  --safe-area-right: env(safe-area-inset-right, 0px)
  --safe-area-bottom: env(safe-area-inset-bottom, 0px)
  --safe-area-left: env(safe-area-inset-left, 0px);
```

## Naming Conventions

### Variable Prefixes

| Prefix          | Domain         | Example                              |
| --------------- | -------------- | ------------------------------------ |
| `--color-*`     | Colors         | `--color-blue`, `--color-positive`   |
| `--font-*`      | Typography     | `--font-face`, `--font-face-heading` |
| `--ui-*`        | UI sizing      | `--ui-height-unit`                   |
| `--button-*`    | Button theming | `--button-color-primary`             |
| `--radius-*`    | Border radius  | `--radius-16`                        |
| `--shadow-*`    | Box shadows    | `--shadow-modal`                     |
| `--safe-area-*` | Device insets  | `--safe-area-bottom`                 |

### Class Naming

- **Base class**: `.button`, `.session-node`, `.sankey-container`
- **Modifier (dash prefix)**: `.button.-primary`, `.button.-danger`, `.button.-small`, `.button.-large`
- **State (dash prefix)**: `.-active`, `.-success`, `.-error`
- **Medical modifiers**: `.-mobile-list`, `.session-source-transcript`
- **Category classes**: `.category-exam`, `.category-laboratory`, etc.

## Responsive Breakpoints

- **Primary breakpoint**: `768px`
  - `max-width: 768px` = mobile
  - `min-width: 769px` = desktop
- **Secondary breakpoint**: `640px` (compact mobile, e.g. Sankey min-height)
- **Touch detection**: `@media (pointer: coarse)` for touch-specific targets
- **Mobile-first approach** with `min()` for responsive sizing without media queries

See `RESPONSIVE.md` for detailed layout strategies and patterns.

## Session / Medical Colors

### Source Colors (left border on session nodes)

| Source               | Color      | Hex       |
| -------------------- | ---------- | --------- |
| `transcript`         | Green      | `#10b981` |
| `medical_history`    | Blue       | `#3b82f6` |
| `family_history`     | Purple     | `#8b5cf6` |
| `social_history`     | Orange     | `#f59e0b` |
| `medication_history` | Cyan       | `#06b6d4` |
| `suspected`          | Orange-red | `#f97316` |

### Priority Colors

| Priority   | Color  | Hex       |
| ---------- | ------ | --------- |
| `critical` | Red    | `#dc2626` |
| `high`     | Orange | `#f59e0b` |
| `medium`   | Blue   | `#3b82f6` |
| `low`      | Green  | `#10b981` |
| `unknown`  | Gray   | `#6b7280` |

### Treatment Type Colors (background RGB)

| Type            | Color       | RGB             |
| --------------- | ----------- | --------------- |
| `medication`    | Soft Blue   | `227, 242, 253` |
| `procedure`     | Soft Red    | `255, 235, 238` |
| `therapy`       | Soft Purple | `243, 229, 245` |
| `lifestyle`     | Soft Green  | `232, 245, 232` |
| `investigation` | Soft Orange | `255, 243, 224` |
| `immediate`     | Bright Red  | `255, 205, 210` |
| `referral`      | Soft Teal   | `224, 242, 241` |
| `supportive`    | Soft Amber  | `255, 249, 230` |

### Relationship Link Colors

| Relationship                            | Color  | Hex       |
| --------------------------------------- | ------ | --------- |
| `supports`, `confirms`                  | Green  | `#4ade80` |
| `suggests`, `indicates`                 | Orange | `#fb923c` |
| `contradicts`, `rules_out`              | Red    | `#f87171` |
| `treats`, `manages`, `requires`         | Blue   | `#60a5fa` |
| `investigates`, `clarifies`, `explores` | Purple | `#a78bfa` |
| Default                                 | Gray   | `#6b7280` |

## Key Patterns

1. **Use semantic aliases** — always prefer `var(--color-positive)` over `#29cc97`
2. **Use `min()` for responsive sizing** — e.g. `min(3rem, 50px)` avoids media queries
3. **Component-level overrides** — use inline `style` attribute or local CSS variables
4. **No external CSS frameworks** — no Tailwind, Bootstrap, etc.
5. **Modifier classes use dash prefix** — `.button.-primary` not `.button--primary`
6. **Session nodes use `--base-color-rgb`** with `--color-opacity` for transparency control
7. **Button variants** override `--color`, `--color-hover`, `--color-text`, `--color-border` locally
