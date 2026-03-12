# Relative Units (CSS)

Use relative units (`em`, `rem`, `%`, `vh`, `vw`) for layout and spacing. Pixels are acceptable only for:

- Icon sizes (`width`/`height` on `<svg>` or icon containers)
- Borders and outlines (`1px solid ...`)
- Box shadows

## Rules

- **Layout dimensions** (width, height, max-width, min-width): use `em`, `rem`, `%`, or viewport units.
- **Padding and margin**: use `em` or `rem`.
- **Font sizes**: use `rem` or `em`, never `px`.
- **Gap, border-radius**: use `em` or `rem`.
- **Media queries**: use `em`.
- When existing code uses `px` for layout elements, convert to relative units as part of the change.
- CSS custom properties for typography (`--ui-font-size`, `--term-font-size`) store `px` values because they feed into JS APIs (xterm.js) that require pixels. This is the only exception beyond icons/borders.
