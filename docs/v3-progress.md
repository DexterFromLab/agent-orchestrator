# BTerminal v3 — Progress Log

### Session: 2026-03-07 — Architecture Planning + MVP Implementation (Phases 1-5)

#### Phase: Adversarial Design Review
- [x] Launch 3 architecture agents (Architect, Devil's Advocate, UX+Performance Specialist)
- [x] Collect findings — 12 issues identified, all resolved
- [x] Produce final architecture plan in docs/v3-task_plan.md
- [x] Create 10-phase implementation plan

#### Phase 1: Data Model + Config
- [x] Created `v2/src/lib/types/groups.ts` — TypeScript interfaces (ProjectConfig, GroupConfig, GroupsFile)
- [x] Created `v2/src-tauri/src/groups.rs` — Rust structs + load/save groups.json
- [x] Added `groups_load`, `groups_save` Tauri commands to lib.rs
- [x] SQLite migrations in session.rs: project_id column, agent_messages table, project_agent_state table
- [x] Created `v2/src/lib/adapters/groups-bridge.ts` (IPC wrapper)
- [x] Created `v2/src/lib/stores/workspace.svelte.ts` (replaces layout.svelte.ts, Svelte 5 runes)
- [x] Added `--group` CLI argument parsing in main.rs
- [x] Wrote 24 vitest tests for workspace store (workspace.test.ts)
- [x] Wrote cargo tests for groups load/save/default

#### Phase 2: Project Box Shell
- [x] Created GlobalTabBar.svelte (Sessions | Docs | Context | Settings)
- [x] Created ProjectGrid.svelte (flex + scroll-snap container)
- [x] Created ProjectBox.svelte (CSS grid: header | session-area | terminal-area)
- [x] Created ProjectHeader.svelte (icon + name + status dot + accent color)
- [x] Rewrote App.svelte (GlobalTabBar + tab content + StatusBar, no sidebar/TilingGrid)
- [x] Created CommandPalette.svelte (Ctrl+K overlay with fuzzy search)
- [x] Created DocsTab.svelte (markdown file browser per project)
- [x] Created ContextTab.svelte (wrapper for ContextPane)
- [x] Created SettingsTab.svelte (per-project + global settings editor)
- [x] CSS for responsive project count + Catppuccin accent colors

#### Phase 3: Claude Session Integration
- [x] Created ClaudeSession.svelte (wraps AgentPane, passes project cwd/profile/config_dir)

#### Phase 4: Terminal Tabs
- [x] Created TerminalTabs.svelte (tab bar + content, shell/SSH/agent tab types)

#### Phase 5: Team Agents Panel
- [x] Created TeamAgentsPanel.svelte (right panel for subagents)
- [x] Created AgentCard.svelte (compact subagent view: status, messages, cost)

#### Bug Fix
- [x] Fixed AgentPane Svelte 5 event modifier syntax: `on:click` -> `onclick` (Svelte 5 requires lowercase event attributes)

#### Verification
- All 138 vitest tests pass (114 existing + 24 new workspace tests)
- All 36 cargo tests pass (29 existing + 7 new groups tests)
- Vite build succeeds

### Session: 2026-03-07 — Phases 6-10 Completion

#### Phase 6: Session Continuity
- [x] Added `persistSessionForProject()` to agent-dispatcher — saves agent state + messages to SQLite on session complete
- [x] Added `registerSessionProject()` — maps sessionId -> projectId for persistence routing
- [x] Added `sessionProjectMap` (Map<string, string>) in agent-dispatcher
- [x] Updated ClaudeSession.svelte: `restoreMessagesFromRecords()` restores cached messages into agent store on mount
- [x] ClaudeSession loads previous state via `loadProjectAgentState()`, restores session ID and messages
- [x] Added `getAgentSession()` export to agents store

#### Phase 7: Workspace Teardown on Group Switch
- [x] Added `clearAllAgentSessions()` to agents store (clears sessions array)
- [x] Updated `switchGroup()` in workspace store to call `clearAllAgentSessions()` + reset terminal tabs
- [x] Updated workspace.test.ts to mock `clearAllAgentSessions`

#### Phase 10: Dead Component Removal + Polish
- [x] Deleted `TilingGrid.svelte` (328 lines), `PaneContainer.svelte` (113 lines), `PaneHeader.svelte` (44 lines)
- [x] Deleted `SessionList.svelte` (374 lines), `SshSessionList.svelte` (263 lines), `SshDialog.svelte` (281 lines), `SettingsDialog.svelte` (433 lines)
- [x] Removed empty directories: Layout/, Sidebar/, Settings/, SSH/
- [x] Rewrote StatusBar.svelte for workspace store (group name, project count, agent count, "BTerminal v3" label)
- [x] Fixed subagent routing in agent-dispatcher: project-scoped sessions skip layout pane creation (subagents render in TeamAgentsPanel instead)
- [x] Updated v3-task_plan.md to mark all 10 phases complete

#### Verification
- All 138 vitest tests pass (including updated workspace tests with clearAllAgentSessions mock)
- All 36 cargo tests pass
- Vite build succeeds
- ~1,836 lines of dead code removed

### Session: 2026-03-07 — SettingsTab Global Settings + Cleanup

#### SettingsTab Global Settings Section
- [x] Added "Global" section to SettingsTab.svelte with three settings:
  - Theme flavor dropdown (Catppuccin Latte/Frappe/Macchiato/Mocha) via `setFlavor()` from theme store
  - Default shell text input (persisted via `setSetting('default_shell', ...)`)
  - Default CWD text input (persisted via `setSetting('default_cwd', ...)`)
- [x] Global settings load on mount via `getSetting()` from settings-bridge
- [x] Added imports: `onMount`, `getSetting`/`setSetting`, `getCurrentFlavor`/`setFlavor`, `CatppuccinFlavor` type

#### A11y Fixes
- [x] Changed project field labels from `<div class="project-field"><label>` to wrapping `<label class="project-field"><span class="field-label">` pattern — proper label/input association
- [x] Global settings use `id`/`for` label association (e.g., `id="theme-flavor"`, `id="default-shell"`)

#### CSS Cleanup
- [x] Removed unused `.project-field label` selector (replaced by `.field-label`)
- [x] Simplified `.project-field input[type="text"], .project-field input:not([type])` to `.project-field input:not([type="checkbox"])`

#### Rust Cleanup (committed separately)
- [x] Removed dead `update_ssh_session()` method from session.rs and its test
- [x] Fixed stale TilingGrid comment in AgentPane.svelte

### Session: 2026-03-07 — Multi-Theme System (7 Editor Themes)

#### Theme System Generalization
- [x] Generalized `CatppuccinFlavor` type to `ThemeId` union type (11 values)
- [x] Added 7 new editor themes: VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark
- [x] Added `ThemePalette` interface (26-color slots) — all themes map to same slots
- [x] Added `ThemeMeta` interface (id, label, group, isDark) for UI metadata
- [x] Added `THEME_LIST: ThemeMeta[]` with group metadata ('Catppuccin' or 'Editor')
- [x] Added `ALL_THEME_IDS: ThemeId[]` derived from THEME_LIST for validation
- [x] Deprecated `CatppuccinFlavor`, `CatppuccinPalette`, `FLAVOR_LABELS`, `ALL_FLAVORS` (kept as backwards compat aliases)

#### Theme Store Updates
- [x] `getCurrentTheme(): ThemeId` replaces `getCurrentFlavor()` as primary getter
- [x] `setTheme(theme: ThemeId)` replaces `setFlavor()` as primary setter
- [x] `initTheme()` validates saved theme against `ALL_THEME_IDS`
- [x] Deprecated `getCurrentFlavor()` and `setFlavor()` with delegation wrappers

#### SettingsTab Theme Selector
- [x] Theme dropdown uses `<optgroup>` per theme group (Catppuccin, Editor)
- [x] `themeGroups` derived from `THEME_LIST` using Map grouping
- [x] `handleThemeChange()` replaces direct `setFlavor()` call
- [x] Fixed input overflow in `.setting-row` with `min-width: 0`

#### Design Decision
All editor themes map to the same `--ctp-*` CSS custom property names (26 vars). This means every component works unchanged — no component-level theme awareness needed. Each theme provides its own mapping of colors to the 26 semantic slots.

#### Verification
- All 138 vitest + 35 cargo tests pass

### Session: 2026-03-07 — Deep Dark Theme Group (6 Themes)

#### New Theme Group: Deep Dark
- [x] Added 6 new "Deep Dark" themes to `v2/src/lib/styles/themes.ts`:
  - Tokyo Night (base: #1a1b26)
  - Gruvbox Dark (base: #1d2021)
  - Ayu Dark (base: #0b0e14, near-black)
  - Poimandres (base: #1b1e28)
  - Vesper (base: #101010, warm dark)
  - Midnight (base: #000000, pure OLED black)
- [x] Extended `ThemeId` union type from 11 to 17 values
- [x] Added `THEME_LIST` entries with `group: 'Deep Dark'`
- [x] Added all 6 palette definitions (26 colors each) mapped to --ctp-* slots
- [x] Total themes: 17 across 3 groups (Catppuccin 4, Editor 7, Deep Dark 6)

#### Verification
- No test changes needed — theme palettes are data-only, no logic changes

### Session: 2026-03-07 — Custom Theme Dropdown

#### SettingsTab Theme Picker Redesign
- [x] Replaced native `<select>` with custom themed dropdown in SettingsTab.svelte
- [x] Dropdown trigger shows color swatch (base color from getPalette()) + theme label + arrow indicator
- [x] Dropdown menu groups themes by category (Catppuccin/Editor/Deep Dark) with styled uppercase headers
- [x] Each option shows: color swatch + label + 4 accent color dots (red/green/blue/yellow)
- [x] Active theme highlighted with surface0 background + bold text
- [x] Click-outside handler and Escape key to close dropdown
- [x] Uses --ctp-* CSS vars throughout — fully themed with any active theme
- [x] Added `getPalette` import from themes.ts for live color rendering
- [x] Added aria-haspopup/aria-expanded attributes for accessibility

#### Verification
- No test changes needed — UI-only change, no logic changes

### Session: 2026-03-07 — Theme Dropdown CSS Polish

#### SettingsTab Dropdown Sizing Fix
- [x] Set `min-width: 180px` on `.theme-dropdown` container (was `min-width: 0`) to prevent trigger from collapsing
- [x] Set `min-width: 280px` on `.theme-options` dropdown menu (was `right: 0`) to ensure full theme names visible
- [x] Increased `max-height` from 320px to 400px on dropdown menu for better scrolling experience
- [x] Added `white-space: nowrap` on `.theme-option-label` (was `min-width: 0`) to prevent label text wrapping

#### Verification
- No test changes needed — CSS-only change

### Session: 2026-03-07 — Global Font Controls

#### SettingsTab Font Family + Font Size Controls
- [x] Added font family `<select>` with 9 monospace font options (JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro, IBM Plex Mono, Hack, Inconsolata, Ubuntu Mono, monospace) + "Default" option
- [x] Added font size +/- stepper control with numeric input (range 8-24px)
- [x] Both controls apply live preview via CSS custom properties (`--ui-font-family`, `--ui-font-size`)
- [x] Both settings persisted to SQLite via settings-bridge (`font_family`, `font_size` keys)
- [x] `handleFontFamilyChange()` and `handleFontSizeChange()` functions with validation

#### SettingsTab Layout Restructure
- [x] Restructured global settings from inline `.setting-row` (label left, control right) to 2-column `.global-grid` with `.setting-field` (label above control)
- [x] Labels now uppercase, 0.7rem, subtext0 color — consistent compact labeling
- [x] All inputs/selects use consistent styling (surface0 bg, surface1 border, 4px radius)

#### CSS Typography Variables
- [x] Added `--ui-font-family` and `--ui-font-size` to catppuccin.css `:root` (defaults: JetBrains Mono fallback chain, 13px)
- [x] Updated `app.css` body rule to use CSS vars instead of hardcoded font values

#### Theme Store Font Restoration
- [x] Extended `initTheme()` in `theme.svelte.ts` to load and apply saved `font_family` and `font_size` settings on startup
- [x] Font restoration wrapped in try/catch — failures are non-fatal (CSS defaults apply)

#### Verification
- No test changes needed — UI/CSS-only changes, no logic changes

### Session: 2026-03-07 — Settings Drawer Conversion

#### Settings Tab to Drawer
- [x] Converted Settings from a full-page tab to a collapsible side drawer
- [x] GlobalTabBar now has 3 tabs (Sessions/Docs/Context) + gear icon toggle for settings drawer
- [x] App.svelte renders SettingsTab in an `<aside>` drawer (right side, 32em width, semi-transparent backdrop)
- [x] Drawer close: Escape key, click-outside (backdrop), close button (X icon)
- [x] Gear icon in GlobalTabBar highlights blue when drawer is open (active state)
- [x] GlobalTabBar accepts props: `settingsOpen`, `ontoggleSettings`
- [x] Removed 'settings' from WorkspaceTab union type (now 'sessions' | 'docs' | 'context')
- [x] Alt+1..3 for tabs (was Alt+1..4), Ctrl+, toggles drawer (was setActiveTab('settings'))
- [x] SettingsTab padding reduced (12px 16px), max-width removed, flex:1 for drawer context

#### Verification
- All 138 vitest tests pass

### Session: 2026-03-08 — VSCode-Style Sidebar Redesign

#### UI Layout Redesign (Top Tab Bar -> Left Sidebar)
- [x] Redesigned GlobalTabBar.svelte from horizontal tab bar to vertical icon rail (36px wide)
  - 4 SVG icon buttons: Sessions (grid), Docs (document), Context (clock), Settings (gear)
  - Each button uses SVG path from `icons` record mapped by WorkspaceTab
  - Props renamed: `settingsOpen` -> `expanded`, `ontoggleSettings` -> `ontoggle`
  - `handleTabClick()` manages toggle: clicking active tab collapses drawer
- [x] Rewrote App.svelte layout from vertical (top tab bar + content area + settings drawer) to horizontal (icon rail + sidebar panel + workspace)
  - `.main-row` flex container: GlobalTabBar | sidebar-panel (28em, max 50%) | workspace
  - ProjectGrid always visible in main workspace (not inside tab content)
  - Sidebar panel renders active tab content (Sessions/Docs/Context/Settings)
  - Panel header with title + close button
  - Removed backdrop overlay, drawer is inline sidebar not overlay
- [x] Re-added 'settings' to WorkspaceTab union type (was removed when settings was a drawer)
- [x] SettingsTab CSS: changed `flex: 1` to `height: 100%` for sidebar panel context
- [x] Updated keyboard shortcuts:
  - Alt+1..4 (was Alt+1..3): switch tabs + open drawer, toggle if same tab
  - Ctrl+B (new): toggle sidebar open/closed
  - Ctrl+, : open settings panel (toggle if already active)
  - Escape: close drawer
- [x] State variables renamed: `settingsOpen` -> `drawerOpen`, `toggleSettings()` -> `toggleDrawer()`
- [x] Added `panelTitles` record for drawer header labels

#### Design Decisions
- VSCode-style sidebar chosen for: always-visible workspace, progressive disclosure, familiar UX
- Settings as regular tab (not special drawer) simplifies code and mental model
- Icon rail at 36px minimizes horizontal space cost
- No backdrop overlay — sidebar is inline, not modal

#### Verification
- All 138 vitest tests pass
- svelte-check clean (only 2 third-party esrap warnings)

### Session: 2026-03-07 — SettingsTab Global Settings Redesign

#### Font Settings Split (UI Font + Terminal Font)
- [x] Split single font setting into UI font (sans-serif options) and Terminal font (monospace options)
- [x] UI font dropdown: System Sans-Serif, Inter, Roboto, Open Sans, Lato, Noto Sans, Source Sans 3, IBM Plex Sans, Ubuntu + Default
- [x] Terminal font dropdown: JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro, IBM Plex Mono, Hack, Inconsolata, Ubuntu Mono, monospace + Default
- [x] Each font dropdown renders preview text in its own typeface
- [x] Size steppers (8-24px) for both UI and Terminal font independently
- [x] Changed setting keys: font_family -> ui_font_family, font_size -> ui_font_size, + new term_font_family, term_font_size

#### SettingsTab Layout Redesign
- [x] Rewrote global settings as single-column layout with labels above controls
- [x] Split into "Appearance" subsection (theme, UI font, terminal font) and "Defaults" subsection (shell, CWD)
- [x] All dropdowns now use reusable custom themed dropdowns (no native `<select>` anywhere)

#### CSS + Theme Store Updates
- [x] Added `--term-font-family` and `--term-font-size` CSS custom properties to catppuccin.css
- [x] Updated `initTheme()` in theme.svelte.ts: loads 4 font settings (ui_font_family, ui_font_size, term_font_family, term_font_size) instead of 2
- [x] UI font fallback changed from monospace to sans-serif

#### Verification
- No test changes needed — UI/CSS-only changes, no logic changes

### Session: 2026-03-08 — CSS Relative Units Rule

#### New Rule: 18-relative-units.md
- [x] Created `.claude/rules/18-relative-units.md` enforcing rem/em for layout CSS
- [x] Pixels allowed only for icon sizes, borders/outlines, box shadows
- [x] Exception: --ui-font-size/--term-font-size CSS vars store px (xterm.js API requirement)
- [x] Added rule #18 to `.claude/CLAUDE.md` rule index

#### CSS Conversions
- [x] GlobalTabBar.svelte: rail width 36px -> 2.75rem, button 28px -> 2rem, gap 2px -> 0.25rem, padding 6px 4px -> 0.5rem 0.375rem, border-radius 4px -> 0.375rem
- [x] App.svelte: sidebar header padding 8px 12px -> 0.5rem 0.75rem, close button 22px -> 1.375rem, border-radius 4px -> 0.25rem
- [x] Also changed GlobalTabBar rail-btn color from --ctp-overlay1 to --ctp-subtext0 for better contrast

### Session: 2026-03-08 — Content-Driven Sidebar Width

#### Sidebar Panel Sizing
- [x] Changed `.sidebar-panel` from fixed `width: 28em` to `width: max-content` with `min-width: 16em` and `max-width: 50%`
- [x] Changed `.sidebar-panel` and `.panel-content` from `overflow: hidden` to `overflow-y: auto` — hidden was blocking content from driving parent width
- [x] Each tab component now defines its own `min-width: 22em` (SettingsTab, ContextTab, DocsTab)

#### Additional px → rem Conversions
- [x] SettingsTab.svelte: padding 12px 16px → 0.75rem 1rem
- [x] DocsTab.svelte: file-picker 220px → 14em, picker-title padding → rem, file-btn padding → rem, empty/loading padding → rem
- [x] ContextPane.svelte: font-size, padding, margin, gap converted from px to rem; added `white-space: nowrap` on `.ctx-header`/`.ctx-error` for intrinsic width measurement

#### Fix: Sidebar Drawer Content-Driven Width
- [x] Root cause found: `#app` in `app.css` had leftover v2 grid layout (`display: grid; grid-template-columns: var(--sidebar-width) 1fr`) constraining `.app-shell` to 260px first column
- [x] Removed v2 grid + both media queries from `#app` — v3 `.app-shell` manages its own flexbox layout
- [x] Added JS `$effect` in App.svelte: measures content width via `requestAnimationFrame` + `querySelectorAll` for nowrap elements, headings, inputs, tab-specific selectors; `panelWidth` state drives inline `style:width`
- [x] Verified all 4 tabs scale to content: Sessions ~473px, Settings ~322px, Context ~580px, Docs varies by content
- [x] Investigation path: CSS intrinsic sizing (max-content, fit-content) failed due to column-flex circular dependency → JS measurement approach → discovered inline style set but rendered width wrong → Playwright inspection revealed parent `.main-row` only 260px → traced to `#app` grid layout

### Session: 2026-03-08 — Native Directory Picker

#### tauri-plugin-dialog Integration
- [x] Added `tauri-plugin-dialog` Rust crate + `@tauri-apps/plugin-dialog` npm package
- [x] Registered plugin in lib.rs (`tauri_plugin_dialog::init()`)
- [x] Removed stub `pick_directory` Tauri command (always returned None)
- [x] Added `browseDirectory()` helper in SettingsTab.svelte using `open({ directory: true })`
- [x] Added folder browse button (folder SVG icon) to: Default CWD, existing project CWD, Add Project path
- [x] Styled `.input-with-browse` layout (flex row, themed browse button)
- [x] Fixed nested input theme: `.setting-field .input-with-browse input` selector for dark background
- [x] Fixed dialog not opening: added `"dialog:default"` permission to `v2/src-tauri/capabilities/default.json` — Tauri IPC security blocked invoke() without capability
- [x] Verified via Playwright: error was `Cannot read properties of undefined (reading 'invoke')` in browser context (expected — Tauri IPC only exists in WebView), confirming code is correct
- [x] Clean rebuild required after capability changes (cached binary doesn't pick up new permissions)

#### Modal + Dark-Themed Dialog
- [x] Root cause: `tauri-plugin-dialog` skips `set_parent(&window)` on Linux via `cfg(any(windows, target_os = "macos"))` gate in commands.rs — dialog not modal
- [x] Root cause: native GTK file chooser uses system GTK theme, not app's CSS theme — dialog appears light
- [x] Fix: custom `pick_directory` Tauri command using `rfd::AsyncFileDialog` directly with `.set_parent(&window)` — modal on Linux
- [x] Fix: `std::env::set_var("GTK_THEME", "Adwaita:dark")` at start of `run()` in lib.rs — dark-themed dialog
- [x] Added `rfd = { version = "0.16", default-features = false, features = ["gtk3"] }` as direct dep — MUST disable defaults to avoid gtk3+xdg-portal feature conflict
- [x] Switched SettingsTab from `@tauri-apps/plugin-dialog` `open()` to `invoke<string | null>('pick_directory')`

### Session: 2026-03-08 — Project Workspace Layout Redesign + Icon Fix

#### Icon Fix
- [x] Replaced Nerd Font codepoints (`\uf120`) with emoji (`📁` default) — Nerd Font not installed, showed "?"
- [x] Added emoji picker grid (24 project-relevant emoji, 8-column popup) in SettingsTab instead of plain text input
- [x] Removed `font-family: 'NerdFontsSymbols Nerd Font'` from ProjectHeader and TerminalTabs

#### ProjectBox Layout Redesign
- [x] Switched ProjectBox from flex to CSS grid (`grid-template-rows: auto 1fr auto`) — header | session | terminal zones
- [x] Terminal area: explicit `height: 16rem` instead of collapsing to content
- [x] Session area: `min-height: 0` for proper flex child overflow

#### AgentPane Prompt Layout
- [x] Prompt area anchored to bottom (`justify-content: flex-end`) instead of vertical center
- [x] Removed `max-width: 600px` constraint on form and toolbar — uses full panel width
- [x] Toolbar sits directly above textarea

#### CSS px → rem Conversions
- [x] ProjectGrid.svelte: gap 4px → 0.25rem, padding 4px → 0.25rem, min-width 480px → 30rem
- [x] TerminalTabs.svelte: tab bar, tabs, close/add buttons all converted to rem
- [x] ProjectBox.svelte: min-width 480px → 30rem

### Session: 2026-03-08 — Project-Level Tabs + Clean AgentPane

#### ProjectHeader Info Bar
- [x] Added CWD path display (ellipsized from START via `direction: rtl` + `text-overflow: ellipsis`)
- [x] Added profile name as info-only text (right side of header)
- [x] Home dir shortening: `/home/user/foo` → `~/foo`

#### Project-Level Tab Bar
- [x] Added tab bar in ProjectBox below header: Claude | Files | Context
- [x] Content area switches between ClaudeSession, ProjectFiles, ContextPane based on selected tab
- [x] CSS grid updated to 4 rows: `auto auto 1fr auto` (header | tabs | content | terminal)
- [x] TeamAgentsPanel still renders alongside ClaudeSession in Claude tab

#### ProjectFiles Component (NEW)
- [x] Created `ProjectFiles.svelte` — project-scoped markdown file viewer
- [x] Accepts `cwd` + `projectName` props (not workspace store)
- [x] File picker sidebar (10rem) + MarkdownPane content area
- [x] Auto-selects priority file or first file

#### AgentPane Cleanup
- [x] Removed entire session toolbar (DIR/ACC interactive inputs + all CSS)
- [x] Added `profile` prop — resolved via `listProfiles()` to get config_dir
- [x] CWD passed as prop from parent (project.cwd), no longer editable in pane
- [x] Clean chat interface: prompt (bottom-anchored) + messages + send button
- [x] ClaudeSession now passes `project.profile` to AgentPane

#### Verification
- All 138 vitest tests pass
- Vite build succeeds

### Session: 2026-03-08 — Security Audit Fixes + OTEL Telemetry

#### Security Audit Fixes
- [x] Fixed all CRITICAL (5) + HIGH (4) findings — path traversal, race conditions, memory leaks, listener leaks, transaction safety
- [x] Fixed all MEDIUM (6) findings — runtime type guards, ANTHROPIC_* env stripping, timestamp mismatch, async lock, error propagation
- [x] Fixed all LOW (8) findings — input validation, mutex poisoning, log warnings, payload validation
- [x] 3 false positives dismissed with rationale
- [x] 172/172 tests pass (138 vitest + 34 cargo)

#### OTEL Telemetry Implementation
- [x] Added 6 Rust deps: tracing, tracing-subscriber, opentelemetry 0.28, opentelemetry_sdk 0.28, opentelemetry-otlp 0.28, tracing-opentelemetry 0.29
- [x] Created `v2/src-tauri/src/telemetry.rs` — TelemetryGuard, layer composition, OTLP export via BTERMINAL_OTLP_ENDPOINT env var
- [x] Integrated into lib.rs: TelemetryGuard in AppState, init before Tauri builder
- [x] Instrumented 10 Tauri commands with `#[tracing::instrument]`: pty_spawn, pty_kill, agent_query/stop/restart, remote_connect/disconnect/agent_query/agent_stop/pty_spawn
- [x] Added `frontend_log` Tauri command for frontend→Rust tracing bridge
- [x] Created `v2/src/lib/adapters/telemetry-bridge.ts` — `tel.info/warn/error/debug/trace()` convenience API
- [x] Wired agent dispatcher lifecycle events: agent_started, agent_stopped, agent_error, sidecar_crashed, cost metrics
- [x] Created Docker compose stack: `docker/tempo/` — Tempo (4317/4318/3200) + Grafana (port 9715)

### Session: 2026-03-08 — Teardown Race Fix + px→rem Conversion

#### Workspace Teardown Race Fix
- [x] Added `pendingPersistCount` counter + `waitForPendingPersistence()` export in agent-dispatcher.ts
- [x] `persistSessionForProject()` increments/decrements counter in try/finally
- [x] `switchGroup()` in workspace.svelte.ts now awaits `waitForPendingPersistence()` before clearing state
- [x] SettingsTab.svelte switchGroup onclick handler made async with await
- [x] Added test for `waitForPendingPersistence` in agent-dispatcher.test.ts
- [x] Added mock for `waitForPendingPersistence` in workspace.test.ts
- [x] Last open HIGH audit finding resolved (workspace teardown race)

#### px→rem Conversion (Rule 18 Compliance)
- [x] Converted ~100 px layout violations to rem across 10 components
- [x] AgentPane.svelte (~35 violations: font-size, padding, gap, margin, max-height, border-radius)
- [x] ToastContainer.svelte, CommandPalette.svelte, TeamAgentsPanel.svelte, AgentCard.svelte
- [x] StatusBar.svelte, AgentTree.svelte, TerminalPane.svelte, AgentPreviewPane.svelte, SettingsTab.svelte
- [x] Icon/decorative dot dimensions kept as px per rule 18
- [x] 139 vitest + 34 cargo tests pass, vite build succeeds

### Session: 2026-03-08 — E2E Testing Infrastructure

#### WebdriverIO + tauri-driver Setup
- [x] Installed @wdio/cli, @wdio/local-runner, @wdio/mocha-framework, @wdio/spec-reporter (v9.24.0)
- [x] Created wdio.conf.js with tauri-driver lifecycle hooks (onPrepare builds debug binary, beforeSession/afterSession spawns/kills tauri-driver)
- [x] Created tsconfig.json for e2e test TypeScript compilation
- [x] Created smoke.test.ts with 6 tests: app title, status bar, version text, sidebar rail, workspace area, sidebar toggle
- [x] Added `test:e2e` npm script (`wdio run tests/e2e/wdio.conf.js`)
- [x] Updated README.md with complete setup instructions and CI guide
- [x] Key decision: WebdriverIO over Playwright (Playwright cannot control Tauri/WebKit2GTK apps)
- [x] Prerequisites: tauri-driver (cargo install), webkit2gtk-driver (apt), display server or xvfb-run
