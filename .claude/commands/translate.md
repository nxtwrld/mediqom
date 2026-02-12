# Translator Skill

Scan Svelte files for hardcoded text and convert to $t() translation calls.

$ARGUMENTS

## Overview

This skill scans Svelte component files, extracts hardcoded English text strings, converts them to `$t()` calls, and updates all locale JSON files (`en.json`, `cs-CZ.json`, `de-DE.json`).

## Translation Library

- **Library**: svelte-i18n v4.0.1
- **Import**: `import { t } from '$lib/i18n';`
- **Locales**: `src/lib/i18n/locales/{en.json, cs-CZ.json, de-DE.json}`
- **Key pattern**: `namespace.category.kebab-case-key`

## Workflow

### Step 1: Analysis

1. Read the target Svelte file(s)
2. Extract hardcoded strings from:
   - Element text content: `>Visible Text<`
   - Attributes: `aria-label`, `placeholder`, `title`, `alt`
   - String literals in conditionals/ternaries
3. Filter out (do NOT translate):
   - Already using `$t()` or `{$t(...)}`
   - CSS classes, technical IDs, URLs
   - Numbers, symbols only
   - Code identifiers and variable names
   - Markdown content and `{@html}` blocks

### Step 2: Key Generation

Derive namespace from file path:

| Component Path | Namespace |
|---------------|-----------|
| `src/components/import/` | `app.import` |
| `src/components/session/` | `session` |
| `src/components/profile/` | `profile` |
| `src/components/documents/` | `documents` |
| `src/components/forms/` | `app.forms` |
| `src/components/ui/` | `app.ui` |
| `src/components/layout/` | `app.layout` |
| `src/components/chat/` | `app.chat` |
| `src/routes/auth/` | `app.auth` |
| `src/routes/med/` | `app.med` |

Generate key: `namespace.category.kebab-case-description`

Example: "Processing files" in `src/components/import/JobCard.svelte` → `app.import.processing-files`

### Step 3: Update Files

1. **Locale files**: Add entries to all three with actual translations:
   - `en.json`: Full English text value
   - `cs-CZ.json`: Czech translation (provide actual translation, never empty strings)
   - `de-DE.json`: German translation (provide actual translation, never empty strings)

2. **Svelte file**:
   - Add import if missing: `import { t } from '$lib/i18n';`
   - Replace hardcoded strings with `{$t('key')}`

### Step 4: Validate

Run `npm run check` to verify TypeScript/Svelte compilation succeeds.

## Translation Patterns

### Simple text content:
```svelte
<!-- Before -->
<button>Save</button>

<!-- After -->
<button>{$t('app.buttons.save')}</button>
```

### Attributes:
```svelte
<!-- Before -->
<input placeholder="Search..." aria-label="Search documents" />

<!-- After -->
<input placeholder={$t('app.search.placeholder')} aria-label={$t('app.search.aria-label')} />
```

### With interpolation (ICU MessageFormat):
```svelte
<!-- Before -->
<p>Hello {user.name}!</p>

<!-- After -->
<p>{$t('app.greeting', { values: { name: user.name } })}</p>
```

### Pluralization:
```json
{
  "app.items-count": "{count, plural, =0 {No items} one {1 item} other {# items}}"
}
```

### Conditional text:
```svelte
<!-- Before -->
{#if loading}Loading...{:else}Done{/if}

<!-- After -->
{#if loading}{$t('app.status.loading')}{:else}{$t('app.status.done')}{/if}
```

## Locale File Structure

Keys are organized hierarchically and alphabetically:

```json
{
  "app": {
    "import": {
      "add-files": "Add files",
      "processing": "Processing..."
    }
  },
  "documents": {
    "title": "Documents"
  }
}
```

## Priority Files (High Impact)

These files likely contain many untranslated strings:
- `src/routes/auth/+page.svelte` - Auth error messages
- `src/components/import/JobCard.svelte` - Status labels
- `src/components/import/FileProgressCard.svelte` - Progress text
- `src/components/forms/InputFile.svelte` - Form labels
- `src/components/ui/Modal.svelte` - Accessibility labels

## Usage Examples

```bash
# Translate single file
> /translate src/components/import/JobCard.svelte

# Scan directory for untranslated files (analysis only)
> /translate --scan src/components/import/

# Batch translate a directory
> /translate src/components/forms/
```

## Notes

- Preserve interpolation variables as ICU MessageFormat syntax
- Skip markdown content and `{@html}` blocks
- Maintain alphabetical key ordering in JSON files
- Czech pluralization uses: `=0`, `one`, `few`, `other` (more complex than English)
- Run `npm run check` after modifications to verify compilation
