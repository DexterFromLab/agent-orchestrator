# BTerminal v2 — Progress Log

> Earlier sessions (2026-03-05 to 2026-03-06 multi-machine): see [progress-archive.md](progress-archive.md)

### Session: 2026-03-09 — AgentPane + MarkdownPane UI Redesign

#### Tribunal-Elected Design (S-3-R4, 88% confidence)
- [x] AgentPane full rewrite: sans-serif root font, tool call/result pairing via `$derived.by` toolResultMap, hook message collapsing, context window meter, cost bar minimized, session summary styling
- [x] Two-phase scroll anchoring (`$effect.pre` + `$effect`)
- [x] Tool-aware output truncation (Bash 500, Read/Write 50, Glob/Grep 20, default 30 lines)
- [x] Colors softened via `color-mix(in srgb, var(--ctp-*) 65%, var(--ctp-surface1) 35%)`
- [x] MarkdownPane: container query wrapper, shared responsive padding variable
- [x] catppuccin.css: `--bterminal-pane-padding-inline: clamp(0.75rem, 3.5cqi, 2rem)`
- [x] 139/139 vitest passing, 0 new TypeScript errors
- [ ] Visual verification in dev mode (pending)

### Session: 2026-03-06 (continued) — Sidecar Env Var Bug Fix

#### CLAUDE* Environment Variable Leak (critical fix)
- [x] Diagnosed silent hang in agent sessions when BTerminal launched from Claude Code terminal
- [x] Root cause: Claude Code sets ~8 CLAUDE* env vars for nesting/sandbox detection
- [x] Fixed both sidecar runners to filter out all keys starting with 'CLAUDE'

### Session: 2026-03-06 (continued) — Sidecar SDK Migration

#### Migration from CLI Spawning to Agent SDK
- [x] Diagnosed root cause: claude CLI v2.1.69 hangs with piped stdio (bug #6775)
- [x] Migrated both runners to @anthropic-ai/claude-agent-sdk query() function
- [x] Added build:sidecar script (esbuild bundle, SDK included)
- [x] SDK options: permissionMode configurable, allowDangerouslySkipPermissions conditional

#### Bug Found and Fixed
- [x] AgentPane onDestroy killed running sessions on layout remounts (fixed: moved to TilingGrid onClose)

### Session: 2026-03-06 (continued) — Permission Mode, AgentPane Bug Fix, SDK Bundling

#### Permission Mode Passthrough
- [x] permission_mode field flows Rust -> sidecar -> SDK, defaults to 'bypassPermissions'

#### AgentPane onDestroy Bug Fix
- [x] Stop-on-close moved from AgentPane onDestroy to TilingGrid onClose handler

#### SDK Bundling Fix
- [x] SDK bundled into agent-runner.mjs (no external dependency at runtime)

### Session: 2026-03-07 — Unified Sidecar Bundle

#### Sidecar Resolution Simplification
- [x] Consolidated to single pre-built bundle (dist/agent-runner.mjs) running on both Deno and Node.js
- [x] resolve_sidecar_command() checks runtime availability upfront, prefers Deno
- [x] agent-runner-deno.ts retained in repo but not used by SidecarManager

### Session: 2026-03-07 (continued) — Rust-Side CLAUDE* Env Var Stripping

#### Dual-Layer Env Var Stripping
- [x] Rust SidecarManager uses env_clear() + envs(clean_env) before spawn (primary defense)
- [x] JS-side stripping retained as defense-in-depth

### Session: 2026-03-07 (continued) — Claude CLI Path Detection

#### pathToClaudeCodeExecutable for SDK
- [x] Added findClaudeCli() to agent-runner.ts (Node.js): checks ~/.local/bin/claude, ~/.claude/local/claude, /usr/local/bin/claude, /usr/bin/claude, then falls back to `which claude`/`where claude`
- [x] Added findClaudeCli() to agent-runner-deno.ts (Deno): same candidate paths, uses Deno.statSync() + Deno.Command("which")
- [x] Both runners now pass pathToClaudeCodeExecutable to SDK query() options
- [x] Early error: if Claude CLI not found, agent_error emitted immediately instead of cryptic SDK failure
- [x] CLI path resolved once at sidecar startup, logged for debugging

### Session: 2026-03-07 (continued) — Claude Profiles & Skill Discovery

#### Claude Profile / Account Switching (switcher-claude integration)
- [x] New Tauri commands: claude_list_profiles(), claude_list_skills(), claude_read_skill(), pick_directory()
- [x] claude_list_profiles() reads ~/.config/switcher/profiles/ for profile directories with profile.toml metadata
- [x] Config dir resolution: ~/.config/switcher-claude/{name}/ or fallback ~/.claude/
- [x] extract_toml_value() simple TOML parser for profile metadata (email, subscription_type, display_name)
- [x] Always includes "default" profile if no switcher profiles found

#### Skill Discovery & Autocomplete
- [x] claude_list_skills() reads ~/.claude/skills/ directory (directories with SKILL.md or standalone .md files)
- [x] Description extracted from first non-heading, non-empty line (max 120 chars)
- [x] claude_read_skill(path) reads full skill file content
- [x] New frontend adapter: v2/src/lib/adapters/claude-bridge.ts (ClaudeProfile, ClaudeSkill interfaces)

#### AgentPane Session Toolbar
- [x] Working directory input (cwdInput) — editable text field, replaces fixed cwd prop
- [x] Profile/account selector dropdown (shown when >1 profile available)
- [x] Selected profile's config_dir passed as claude_config_dir in AgentQueryOptions
- [x] Skill autocomplete menu: type `/` to trigger, arrow keys navigate, Tab/Enter select, Escape dismiss
- [x] expandSkillPrompt(): reads skill content via readSkill(), prepends to prompt with optional user args

#### Extended AgentQueryOptions (full stack passthrough)
- [x] New fields in Rust AgentQueryOptions struct: setting_sources, system_prompt, model, claude_config_dir, additional_directories
- [x] Sidecar QueryMessage interface updated with matching fields
- [x] Both sidecar runners (agent-runner.ts, agent-runner-deno.ts) pass new fields to SDK query()
- [x] CLAUDE_CONFIG_DIR injected into cleanEnv when claudeConfigDir provided (multi-account support)
- [x] settingSources defaults to ['user', 'project'] (loads CLAUDE.md and project settings)
- [x] Frontend AgentQueryOptions interface updated in agent-bridge.ts

### Session: 2026-03-07 (continued) — v3 Mission Control Planning

#### v3 Architecture Planning
- [x] Created docs/v3-task_plan.md — core concept, user requirements, architecture questions
- [x] Created docs/v3-findings.md — codebase reuse analysis (what to keep/replace/drop)
- [x] Created docs/v3-progress.md — v3-specific progress log
- [x] Launched 3 adversarial architecture agents (Architect, Devil's Advocate, UX+Perf Specialist)
- [x] Collect adversarial agent findings
- [x] Produce final architecture plan
- [x] Create v3 implementation phases

### Session: 2026-03-07 (continued) — v3 Mission Control MVP Implementation (Phases 1-5)

#### Phase 1: Data Model + Config
- [x] Created v2/src/lib/types/groups.ts (ProjectConfig, GroupConfig, GroupsFile interfaces)
- [x] Created v2/src-tauri/src/groups.rs (Rust structs + load/save groups.json + default_groups())
- [x] Added groups_load, groups_save Tauri commands to lib.rs
- [x] SQLite migrations in session.rs: project_id column, agent_messages table, project_agent_state table
- [x] Created v2/src/lib/adapters/groups-bridge.ts (IPC wrapper)
- [x] Created v2/src/lib/stores/workspace.svelte.ts (replaces layout.svelte.ts for v3, Svelte 5 runes)
- [x] Added --group CLI argument parsing in main.rs
- [x] 24 vitest tests for workspace store + 7 cargo tests for groups

#### Phase 2: Project Box Shell
- [x] Created 12 new Workspace components in v2/src/lib/components/Workspace/
- [x] GlobalTabBar, ProjectGrid, ProjectBox, ProjectHeader, CommandPalette, DocsTab, ContextTab, SettingsTab
- [x] Rewrote App.svelte (no sidebar, no TilingGrid — GlobalTabBar + tab content + StatusBar)

#### Phase 3: Claude Session Integration
- [x] Created ClaudeSession.svelte wrapping AgentPane per-project

#### Phase 4: Terminal Tabs
- [x] Created TerminalTabs.svelte with shell/SSH/agent tab types

#### Phase 5: Team Agents Panel
- [x] Created TeamAgentsPanel.svelte + AgentCard.svelte

#### Bug Fix
- [x] Fixed AgentPane Svelte 5 event modifier: on:click -> onclick

#### Verification
- All 138 vitest + 36 cargo tests pass, vite build succeeds

### Session: 2026-03-07 (continued) — v3 Phases 6-10 Completion

#### Phase 6: Session Continuity
- [x] Added persistSessionForProject() to agent-dispatcher (saves state + messages to SQLite on complete)
- [x] Added registerSessionProject() + sessionProjectMap for session->project persistence routing
- [x] ClaudeSession restoreMessagesFromRecords() restores cached messages on mount
- [x] Added getAgentSession() export to agents store

#### Phase 7: Workspace Teardown
- [x] Added clearAllAgentSessions() to agents store
- [x] switchGroup() calls clearAllAgentSessions() + resets terminal tabs
- [x] Updated workspace.test.ts with clearAllAgentSessions mock

#### Phase 10: Dead Component Removal + Polish
- [x] Deleted 7 dead v2 components (~1,836 lines): TilingGrid, PaneContainer, PaneHeader, SessionList, SshSessionList, SshDialog, SettingsDialog
- [x] Removed empty directories: Layout/, Sidebar/, Settings/, SSH/
- [x] Rewrote StatusBar for workspace store (group name, project count, "BTerminal v3")
- [x] Fixed subagent routing: project-scoped sessions skip layout pane (render in TeamAgentsPanel)
- [x] Updated v3-task_plan.md to mark all 10 phases complete

#### Verification
- All 138 vitest + 36 cargo tests pass, vite build succeeds

### Session: 2026-03-07 (continued) — Multi-Theme System

#### Theme System Generalization (7 Editor Themes)
- [x] Generalized CatppuccinFlavor to ThemeId union type (11 themes)
- [x] Added 7 editor themes: VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark
- [x] Added ThemePalette, ThemeMeta, THEME_LIST types; deprecated old Catppuccin-only types
- [x] Theme store: getCurrentTheme()/setTheme() with deprecated wrappers for backwards compat
- [x] SettingsTab: optgroup-based theme selector, fixed input overflow with min-width:0
- [x] All themes map to same --ctp-* CSS vars — zero component changes needed

#### Verification
- All 138 vitest + 35 cargo tests pass

### Session: 2026-03-07 (continued) — Deep Dark Theme Group

#### 6 New Deep Dark Themes
- [x] Added Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight to themes.ts
- [x] Extended ThemeId from 11 to 17 values, THEME_LIST from 11 to 17 entries
- [x] New "Deep Dark" theme group (3rd group alongside Catppuccin and Editor)
- [x] Midnight is pure OLED black (#000000), Ayu Dark near-black (#0b0e14), Vesper warm dark (#101010)
- [x] All 6 themes map to same 26 --ctp-* CSS vars — zero component changes needed

### Session: 2026-03-07 (continued) — Custom Theme Dropdown

#### SettingsTab Theme Picker Redesign
- [x] Replaced native `<select>` with custom themed dropdown in SettingsTab.svelte
- [x] Trigger: color swatch (base) + label + arrow; menu: grouped sections with styled headers
- [x] Options show color swatch + label + 4 accent dots (red/green/blue/yellow) via getPalette()
- [x] Click-outside and Escape to close; aria-haspopup/aria-expanded for a11y
- [x] Uses --ctp-* CSS vars — fully themed with active theme

### Session: 2026-03-07 (continued) — Global Font Controls

#### SettingsTab Font Controls + Layout Restructure
- [x] Added font family select (9 monospace fonts + Default) with live CSS var preview
- [x] Added font size +/- stepper (8-24px range) with live CSS var preview
- [x] Restructured global settings: 2-column grid layout with labels above controls (replaced inline rows)
- [x] Added --ui-font-family and --ui-font-size CSS custom properties to catppuccin.css
- [x] app.css body rule now uses CSS vars instead of hardcoded font values
- [x] initTheme() in theme.svelte.ts restores saved font settings on startup (try/catch, non-fatal)
- [x] Font settings persisted as 'font_family' and 'font_size' keys in SQLite settings table

### Session: 2026-03-07 (continued) — SettingsTab Global Settings Redesign

#### Font Settings Split (UI Font + Terminal Font)
- [x] Split single font into UI font (sans-serif: System Sans-Serif, Inter, Roboto, etc.) and Terminal font (monospace: JetBrains Mono, Fira Code, etc.)
- [x] Each font dropdown renders preview text in its own typeface
- [x] Independent size steppers (8-24px) for UI and Terminal font
- [x] Setting keys changed: font_family/font_size -> ui_font_family/ui_font_size + term_font_family/term_font_size

#### SettingsTab Layout + CSS Updates
- [x] Rewrote global settings: single-column layout, "Appearance" + "Defaults" subsections
- [x] All dropdowns are custom themed (no native `<select>` anywhere)
- [x] Added --term-font-family and --term-font-size CSS vars to catppuccin.css
- [x] Updated initTheme() to restore 4 font settings instead of 2

### Session: 2026-03-08 — CSS Relative Units Rule
- [x] Created `.claude/rules/18-relative-units.md` — enforces rem/em for layout CSS (px only for icons/borders)
- [x] Converted GlobalTabBar.svelte styles from px to rem (rail width, button size, gap, padding, border-radius)
- [x] Converted App.svelte sidebar header styles from px to rem (padding, close button, border-radius)
- [x] Changed GlobalTabBar rail-btn color from --ctp-overlay1 to --ctp-subtext0

### Session: 2026-03-09 — AgentPane Collapsibles, Aspect Ratio, Desktop Integration

#### AgentPane Collapsible Messages
- [x] Text messages (`msg.type === 'text'`) wrapped in `<details open>` — open by default, collapsible
- [x] Cost summary (`cost.result`) wrapped in `<details>` — collapsed by default, expandable
- [x] CSS: `.msg-text-collapsible` and `.msg-summary-collapsible` with preview text

#### Project Max Aspect Ratio Setting
- [x] New `project_max_aspect` SQLite setting (float, default 1.0, range 0.3–3.0)
- [x] ProjectGrid: `max-width: calc(100vh * var(--project-max-aspect, 1))` on `.project-slot`
- [x] SettingsTab: stepper UI in Appearance section
- [x] App.svelte: restore on startup via getSetting()

#### Desktop Integration
- [x] install-v2.sh: added `StartupWMClass=bterminal` to .desktop template
- [x] GNOME auto-move extension compatible

#### No-Implicit-Push Rule
- [x] Created `.claude/rules/52-no-implicit-push.md` — never push unless explicitly asked

### Next Steps
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning for relay connections
- [ ] Test agent teams with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
