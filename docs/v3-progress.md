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
