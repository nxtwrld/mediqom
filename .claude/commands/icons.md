# Icons Skill

Use this skill when working with icons in Svelte components.

$ARGUMENTS

## Icon System Overview

This project uses SVG sprite sheets for icons. There are **three sprite files**:

| Sprite File    | Source Directory            | Purpose                             |
| -------------- | --------------------------- | ----------------------------------- |
| `/icons.svg`   | `assets-src/icons/`         | Solid/filled UI icons               |
| `/icons-o.svg` | `assets-src/icons-outline/` | Outline icons (medical, properties) |
| `/files.svg`   | `assets-src/files/`         | File type icons                     |

## Usage in Svelte Components

```svelte
<!-- Solid icons (icons.svg) -->
<svg><use href="/icons.svg#edit"></use></svg>
<svg><use href="/icons.svg#close"></use></svg>

<!-- Outline icons (icons-o.svg) -->
<svg><use href="/icons-o.svg#report-general"></use></svg>
<svg><use href="/icons-o.svg#warning"></use></svg>

<!-- File type icons (files.svg) -->
<svg><use href="/files.svg#pdf"></use></svg>
```

**Important**: Use `href` not `xlink:href` (modern SVG syntax).

## Available Icons

### icons.svg (Solid UI Icons)

```
add-file, anatomy, anatomy-reset, arrow-nav-down, arrow-nav-left,
arrow-nav-right, arrow-nav-up, arrow-round-down, arrow-round-up,
bubble-chat, chart-bar, chart-line, close, doctor, download, edit,
email, location-medical, message, mic, mic-off, minus, phone, pin,
plus, report, search, selection, share, star, user
```

### icons-o.svg (Outline Icons)

```
calendar, checked, diagnosis, encrypt, model-gp, model-pt, model-voice,
prop-age, prop-biologicalSex-female, prop-biologicalSex-male,
prop-bloodPressure, prop-bloodType, prop-height, prop-laboratory,
prop-weight, registration-form, report-dental, report-exam,
report-general, report-imaging, report-laboratory, report-medication,
report-procedure, report-survey, report-vital-signs, transcript, warning
```

### files.svg (File Type Icons)

```
doc, jpeg, jpg, pdf, png, txt, xls, zip
```

## Adding New Icons

### Step 1: Add SVG Source File

Place your SVG file in the appropriate source directory:

- **Solid icons**: `assets-src/icons/my-icon.svg`
- **Outline icons**: `assets-src/icons-outline/my-icon.svg`
- **File icons**: `assets-src/files/my-icon.svg`

The filename (without `.svg`) becomes the icon ID.

### Step 2: Prepare the SVG

Ensure your SVG:

- Has no `width`/`height` attributes (use `viewBox` instead)
- Uses `currentColor` for fills/strokes (to inherit color from CSS)
- Has clean, minimal markup

Example:

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5z"/>
</svg>
```

### Step 3: Regenerate Sprite

Run the sprite generator from the `assets-src` directory:

```bash
cd assets-src
node svgToSprite.js
```

This updates the sprite files in `static/`.

### Step 4: Use in Components

```svelte
<svg><use href="/icons.svg#my-icon"></use></svg>
```

## Common Icon Styling

```css
/* Standard icon button */
.icon-btn svg {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
}

/* Larger icon */
.icon-lg svg {
  width: 1.5rem;
  height: 1.5rem;
}

/* Icon with hover color */
.icon-btn:hover svg {
  fill: var(--color-primary);
}
```

## Common Patterns

### Action Buttons

```svelte
<button class="action-btn" aria-label="Edit">
    <svg><use href="/icons.svg#edit"></use></svg>
</button>
<button class="action-btn delete" aria-label="Delete">
    <svg><use href="/icons.svg#close"></use></svg>
</button>
```

### Status Indicators

```svelte
<span class="status-icon warning">
    <svg><use href="/icons-o.svg#warning"></use></svg>
</span>
<span class="status-icon success">
    <svg><use href="/icons-o.svg#checked"></use></svg>
</span>
```

### File Type Badges

```svelte
<span class="file-badge">
    <svg><use href="/files.svg#pdf"></use></svg>
</span>
```

## Troubleshooting

### Icon Not Showing (404 Error)

- Check the sprite file exists in `static/`
- Verify the icon ID matches a source file in `assets-src/`
- Run the sprite generator if you added new icons
- Use browser DevTools Network tab to confirm the path

### Icon Not Inheriting Color

- Ensure the source SVG uses `fill="currentColor"` or `stroke="currentColor"`
- Check CSS `fill` or `color` is set on the parent element

### Wrong Icon Displayed

- Icon IDs must be unique across the sprite
- Check for typos in the `href` attribute
