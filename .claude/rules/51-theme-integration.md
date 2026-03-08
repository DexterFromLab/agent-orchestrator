# Theme Integration (CSS)

All UI components MUST use the project's CSS custom properties for colors. Never hardcode color values.

## Rules

- **Backgrounds**: Use `var(--ctp-base)`, `var(--ctp-mantle)`, `var(--ctp-crust)`, `var(--ctp-surface0)`, `var(--ctp-surface1)`, `var(--ctp-surface2)`.
- **Text**: Use `var(--ctp-text)`, `var(--ctp-subtext0)`, `var(--ctp-subtext1)`.
- **Muted/overlay text**: Use `var(--ctp-overlay0)`, `var(--ctp-overlay1)`, `var(--ctp-overlay2)`.
- **Accents**: Use `var(--ctp-blue)`, `var(--ctp-green)`, `var(--ctp-mauve)`, `var(--ctp-peach)`, `var(--ctp-pink)`, `var(--ctp-red)`, `var(--ctp-yellow)`, `var(--ctp-teal)`, `var(--ctp-sapphire)`, `var(--ctp-lavender)`, `var(--ctp-flamingo)`, `var(--ctp-rosewater)`, `var(--ctp-maroon)`, `var(--ctp-sky)`.
- **Per-project accent**: Use `var(--accent)` which is set per ProjectBox slot.
- **Borders**: Use `var(--ctp-surface0)` or `var(--ctp-surface1)`.
- Never use raw hex/rgb/hsl color values in component CSS. All colors must go through `--ctp-*` variables.
- Hover states: typically lighten by stepping up one surface level (e.g., surface0 -> surface1) or change text from subtext0 to text.
- Active/selected states: use `var(--accent)` or a specific accent color with `var(--ctp-base)` background distinction.
- Disabled states: reduce opacity (0.4-0.5) rather than introducing gray colors.
- Use `color-mix()` for semi-transparent overlays: `color-mix(in srgb, var(--ctp-blue) 10%, transparent)`.
