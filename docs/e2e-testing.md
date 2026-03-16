# E2E Testing Facility

BTerminal's end-to-end testing uses **WebDriverIO + tauri-driver** to drive the real Tauri application through WebKit2GTK's inspector protocol. The facility has three pillars:

1. **Test Fixtures** — isolated fake environments with dummy projects
2. **Test Mode** — app-level env vars that disable watchers and redirect data/config paths
3. **LLM Judge** — Claude-powered semantic assertions for evaluating agent behavior

## Quick Start

```bash
# Run all tests (vitest + cargo + E2E)
npm run test:all:e2e

# Run E2E only (requires pre-built debug binary)
SKIP_BUILD=1 npm run test:e2e

# Build debug binary separately (faster iteration)
cargo tauri build --debug --no-bundle

# Run with LLM judge via CLI (default, auto-detected)
npm run test:e2e

# Force LLM judge to use API instead of CLI
LLM_JUDGE_BACKEND=api ANTHROPIC_API_KEY=sk-... npm run test:e2e
```

## Prerequisites

| Dependency | Purpose | Install |
|-----------|---------|---------|
| Rust + Cargo | Build Tauri backend | [rustup.rs](https://rustup.rs) |
| Node.js 20+ | Frontend + test runner | `mise install node` |
| tauri-driver | WebDriver bridge to WebKit2GTK | `cargo install tauri-driver` |
| X11 display | WebKit2GTK needs a display | Real X, or `xvfb-run` in CI |
| Claude CLI | LLM judge (optional) | [claude.ai/download](https://claude.ai/download) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ WebDriverIO (mocha runner)                              │
│   specs/*.test.ts                                       │
│     └─ browser.execute() → DOM queries + assertions     │
│     └─ assertWithJudge() → LLM semantic evaluation     │
├─────────────────────────────────────────────────────────┤
│ tauri-driver (port 4444)                                │
│   WebDriver protocol ↔ WebKit2GTK inspector             │
├─────────────────────────────────────────────────────────┤
│ BTerminal debug binary                                  │
│   BTERMINAL_TEST=1 (disables watchers, wake scheduler)  │
│   BTERMINAL_TEST_DATA_DIR → isolated SQLite DBs         │
│   BTERMINAL_TEST_CONFIG_DIR → test groups.json          │
└─────────────────────────────────────────────────────────┘
```

## Pillar 1: Test Fixtures (`fixtures.ts`)

The fixture generator creates isolated temporary environments so tests never touch real user data. Each fixture includes:

- **Temp root dir** under `/tmp/bterminal-e2e-{timestamp}/`
- **Data dir** — empty, SQLite databases created at runtime
- **Config dir** — contains a generated `groups.json` with test projects
- **Project dir** — a real git repo with `README.md` and `hello.py` (for agent testing)

### Single-Project Fixture

```typescript
import { createTestFixture, destroyTestFixture } from '../fixtures';

const fixture = createTestFixture('my-test');

// fixture.rootDir    → /tmp/my-test-1710234567890/
// fixture.dataDir    → /tmp/my-test-1710234567890/data/
// fixture.configDir  → /tmp/my-test-1710234567890/config/
// fixture.projectDir → /tmp/my-test-1710234567890/test-project/
// fixture.env        → { BTERMINAL_TEST: '1', BTERMINAL_TEST_DATA_DIR: '...', BTERMINAL_TEST_CONFIG_DIR: '...' }

// The test project is a git repo with:
//   README.md  — "# Test Project\n\nA simple test project for BTerminal E2E tests."
//   hello.py   — "def greet(name: str) -> str:\n    return f\"Hello, {name}!\""
// Both committed as "initial commit"

// groups.json contains one group "Test Group" with one project pointing at projectDir

// Cleanup when done:
destroyTestFixture(fixture);
```

### Multi-Project Fixture

```typescript
import { createMultiProjectFixture } from '../fixtures';

const fixture = createMultiProjectFixture(3); // 3 separate git repos

// Creates project-0, project-1, project-2 under fixture.rootDir
// Each is a git repo with README.md
// groups.json has one group "Multi Project Group" with all 3 projects
```

### Fixture Environment Variables

Pass `fixture.env` to the app to redirect all data/config paths:

| Variable | Effect |
|----------|--------|
| `BTERMINAL_TEST=1` | Disables file watchers, wake scheduler, enables `is_test_mode` |
| `BTERMINAL_TEST_DATA_DIR` | Redirects `sessions.db` and `btmsg.db` storage |
| `BTERMINAL_TEST_CONFIG_DIR` | Redirects `groups.json` config loading |

## Pillar 2: Test Mode

When `BTERMINAL_TEST=1` is set:

- **Rust backend**: `watcher.rs` and `fs_watcher.rs` skip file watchers
- **Frontend**: `is_test_mode` Tauri command returns true, wake scheduler disabled via `disableWakeScheduler()`
- **Data isolation**: `BTERMINAL_TEST_DATA_DIR` / `BTERMINAL_TEST_CONFIG_DIR` override default paths

The WebDriverIO config (`wdio.conf.js`) passes these env vars via `tauri:options.env` in capabilities.

## Pillar 3: LLM Judge (`llm-judge.ts`)

The LLM judge enables semantic assertions — evaluating whether agent output "looks right" rather than exact string matching. Useful for testing AI agent responses where exact output is non-deterministic.

### Dual Backend

The judge supports two backends, auto-detected or explicitly set:

| Backend | How it works | Requires |
|---------|-------------|----------|
| `cli` (default) | Spawns `claude` CLI with `--output-format text` | Claude CLI installed |
| `api` | Raw `fetch` to `https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` env var |

**Auto-detection order**: CLI first → API fallback → skip test.

**Override**: Set `LLM_JUDGE_BACKEND=cli` or `LLM_JUDGE_BACKEND=api`.

### API

```typescript
import { isJudgeAvailable, judge, assertWithJudge } from '../llm-judge';

// Check availability (CLI or API key present)
if (!isJudgeAvailable()) {
  this.skip(); // graceful skip in mocha
  return;
}

// Basic judge call
const verdict = await judge(
  'The output should contain a file listing with at least one filename',  // criteria
  actualOutput,                                                            // actual
  'Agent was asked to list files in a directory containing README.md',     // context (optional)
);
// verdict: { pass: boolean, reasoning: string, confidence: number }

// With confidence threshold (default 0.7)
const verdict = await assertWithJudge(
  'Response should describe the greet function',
  agentMessages,
  { context: 'hello.py contains def greet(name)', minConfidence: 0.8 },
);
```

### How It Works

1. Builds a structured prompt with criteria, actual output, and optional context
2. Asks Claude (Haiku) to evaluate as a test assertion judge
3. Expects JSON response: `{"pass": true/false, "reasoning": "...", "confidence": 0.0-1.0}`
4. Validates and returns structured `JudgeVerdict`

The CLI backend unsets `CLAUDECODE` env var to avoid nested session errors when running inside Claude Code.

## Test Spec Files

| File | Phase | Tests | Focus |
|------|-------|-------|-------|
| `bterminal.test.ts` | Smoke | ~50 | Basic UI rendering, CSS class selectors |
| `agent-scenarios.test.ts` | A | 22 | `data-testid` selectors, 7 deterministic scenarios |
| `phase-b.test.ts` | B | ~15 | Multi-project grid, LLM-judged agent responses |
| `phase-c.test.ts` | C | 27 | Hardening features (palette, search, notifications, keyboard, settings, health, metrics, context, files) |

### Phase A: Deterministic Agent Scenarios

Uses `data-testid` attributes for reliable selectors. Tests app structure, project rendering, and agent pane states without live agent interaction.

### Phase B: Multi-Project + LLM Judge

Tests multi-project grid rendering, independent tab switching, status bar fleet state. LLM-judged tests (B4, B5) send real prompts to agents and evaluate response quality — these require Claude CLI or API key and are skipped otherwise.

### Phase C: Production Hardening

Tests v3 hardening features: command palette commands (C1), search overlay (C2), notification center (C3), keyboard navigation (C4), settings panel (C5), project health indicators (C6), metrics tab (C7), context tab (C8), files tab with editor (C9), LLM-judged settings (C10), LLM-judged status bar (C11).

## Test Results Tracking (`results-db.ts`)

A lightweight JSON store for tracking test runs and individual step results:

```typescript
import { ResultsDb } from '../results-db';

const db = new ResultsDb(); // writes to test-results/results.json

db.startRun('run-001', 'v2-mission-control', 'abc123');
db.recordStep({
  run_id: 'run-001',
  scenario_name: 'B4',
  step_name: 'should send prompt and get meaningful response',
  status: 'passed',
  duration_ms: 15000,
  error_message: null,
  screenshot_path: null,
  agent_cost_usd: 0.003,
});
db.finishRun('run-001', 'passed', 45000);
```

## CI Integration (`.github/workflows/e2e.yml`)

The CI pipeline runs on push/PR with path-filtered triggers:

1. **Unit tests** — `npm run test` (vitest)
2. **Cargo tests** — `cargo test` (with `env -u BTERMINAL_TEST` to prevent env leakage)
3. **E2E tests** — `xvfb-run npm run test:e2e` (virtual framebuffer for headless WebKit2GTK)

LLM-judged tests are gated on the `ANTHROPIC_API_KEY` secret — they skip gracefully in forks or when the secret is absent.

## Writing New Tests

### Adding a New Scenario

1. Pick the appropriate spec file (or create a new phase file)
2. Use `data-testid` selectors where possible (more stable than CSS classes)
3. For DOM queries, use `browser.execute()` to run JS in the app context
4. For semantic assertions, use `assertWithJudge()` with clear criteria

### Common Helpers

All spec files share similar helper patterns:

```typescript
// Get project IDs
const ids: string[] = await browser.execute(() => {
  const boxes = document.querySelectorAll('[data-testid="project-box"]');
  return Array.from(boxes).map(b => b.getAttribute('data-project-id') ?? '').filter(Boolean);
});

// Focus a project
await browser.execute((id) => {
  const box = document.querySelector(`[data-project-id="${id}"]`);
  const header = box?.querySelector('.project-header');
  if (header) (header as HTMLElement).click();
}, projectId);

// Switch tab in a project
await browser.execute((id, idx) => {
  const box = document.querySelector(`[data-project-id="${id}"]`);
  const tabs = box?.querySelectorAll('[data-testid="project-tabs"] .ptab');
  if (tabs && tabs[idx]) (tabs[idx] as HTMLElement).click();
}, projectId, tabIndex);
```

### WebDriverIO Config (`wdio.conf.js`)

Key settings:

- **Single session**: `maxInstances: 1` — tauri-driver can't handle parallel sessions
- **Lifecycle**: `onPrepare` builds debug binary, `beforeSession` spawns tauri-driver with TCP readiness probe, `afterSession` kills tauri-driver
- **Timeouts**: 60s per test (mocha), 10s waitfor, 30s connection retry
- **Skip build**: Set `SKIP_BUILD=1` to reuse existing binary

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Callback was not called before unload" | Stale binary — rebuild with `cargo tauri build --debug --no-bundle` |
| Tests hang on startup | Kill stale `tauri-driver` processes: `pkill -f tauri-driver` |
| All tests skip LLM judge | Install Claude CLI or set `ANTHROPIC_API_KEY` |
| SIGUSR2 / exit code 144 | Stale tauri-driver on port 4444 — kill and retry |
| `BTERMINAL_TEST` leaking to cargo | Run cargo tests with `env -u BTERMINAL_TEST cargo test` |
| No display available | Use `xvfb-run` or ensure X11/Wayland display is set |
