# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **Convert remaining components to rem** -- Apply rule 18 (relative-units.md) to all remaining px-based layout CSS across v3 components.

## Completed

- [x] **Project workspace layout redesign** -- CSS grid layout for ProjectBox (header|session|terminal), bottom-anchored AgentPane prompt, emoji icons replacing Nerd Font, px→rem conversions across 4 components. | Done: 2026-03-08
- [x] **Native directory picker** -- Added tauri-plugin-dialog for native OS folder picker on CWD fields (Default CWD, project CWD, Add Project path). Removed stub pick_directory command. | Done: 2026-03-08
- [x] **Fix sidebar drawer content-driven width** -- Root cause: leftover v2 grid layout on #app in app.css (`grid-template-columns: var(--sidebar-width) 1fr`) constrained .app-shell to 260px. Removed grid; JS $effect measurement now works correctly, all 4 tabs scale to content. | Done: 2026-03-08
- [x] **CSS relative units rule** -- Added .claude/rules/18-relative-units.md enforcing rem/em for layout CSS. Converted GlobalTabBar.svelte + App.svelte sidebar styles from px to rem. | Done: 2026-03-08
- [x] **VSCode-style sidebar redesign** -- Redesigned UI from top tab bar + right-side settings drawer to VSCode-style left sidebar: vertical icon rail (2.75rem, 4 SVG icons) + expandable drawer panel (content-driven width) + always-visible workspace. Settings is regular tab. Ctrl+B toggles sidebar. | Done: 2026-03-08
- [x] **Settings drawer conversion** -- Converted Settings from full-page tab to collapsible side drawer (superseded by sidebar redesign 2026-03-08). | Done: 2026-03-07
- [x] **SettingsTab global settings redesign** -- Split font into UI font (sans-serif options) + Terminal font (monospace options), each with custom dropdown + size stepper. Single-column layout with Appearance/Defaults subsections. All custom themed dropdowns (no native select). New CSS vars: --term-font-family, --term-font-size. Setting keys: ui_font_family, ui_font_size, term_font_family, term_font_size. | Done: 2026-03-07
- [x] **Global font controls** -- Font family select (9 monospace fonts) + font size +/- stepper (8-24px) in SettingsTab. Live preview via CSS vars, persisted to SQLite. initTheme() restores on startup. | Done: 2026-03-07
- [x] **Deep Dark theme group** -- 6 new themes (Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight). Total: 17 themes in 3 groups. | Done: 2026-03-07
- [x] **Custom theme dropdown** -- Replaced native `<select>` with custom themed dropdown showing color swatches and accent dots. | Done: 2026-03-07
- [x] **Multi-theme system** -- 7 editor themes (VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark) + 4 Catppuccin. ThemeId/ThemePalette/ThemeMeta types, THEME_LIST, custom dropdown. | Done: 2026-03-07
- [x] **v3 Phases 6-10 Complete** -- Session continuity (persist/restore agent messages), workspace teardown on group switch, dead v2 component removal (~1,836 lines), StatusBar rewrite, subagent routing fix. | Done: 2026-03-07
- [x] **v3 Mission Control MVP (Phases 1-5)** -- Data model + groups.rs + workspace store + 12 Workspace components + App.svelte rewrite + ClaudeSession + TerminalTabs + TeamAgentsPanel. 138 vitest + 36 cargo tests. | Done: 2026-03-07
