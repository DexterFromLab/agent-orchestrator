# E2E Tests (WebDriver)

Tauri apps use the WebDriver protocol for E2E testing (not Playwright directly).
The app runs inside WebKit2GTK on Linux, so tests interact with the real WebView.

## Prerequisites

- Rust toolchain (for building the Tauri app)
- Display server (X11 or Wayland) — headless Xvfb works for CI
- `tauri-driver` installed: `cargo install tauri-driver`
- `webkit2gtk-driver` system package: `sudo apt install webkit2gtk-driver`
- npm devDeps already in package.json (`@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`)

## Running

```bash
# From v2/ directory — builds debug binary automatically, spawns tauri-driver
npm run test:e2e

# Skip rebuild (use existing binary)
SKIP_BUILD=1 npm run test:e2e

# With test isolation (custom data/config dirs)
BTERMINAL_TEST_DATA_DIR=/tmp/bt-test/data BTERMINAL_TEST_CONFIG_DIR=/tmp/bt-test/config npm run test:e2e
```

The `wdio.conf.js` handles:
1. Building the debug binary (`cargo tauri build --debug --no-bundle`) in `onPrepare`
2. Spawning `tauri-driver` before each session (TCP readiness probe, 10s deadline)
3. Killing `tauri-driver` after each session
4. Passing `BTERMINAL_TEST=1` env var to the app for test mode isolation

## Test Mode (`BTERMINAL_TEST=1`)

When `BTERMINAL_TEST=1` is set:
- File watchers (watcher.rs, fs_watcher.rs) are disabled to avoid inotify noise
- Wake scheduler is disabled (no auto-wake timers)
- Data/config directories can be overridden via `BTERMINAL_TEST_DATA_DIR` / `BTERMINAL_TEST_CONFIG_DIR`

## CI setup (headless)

```bash
# Install virtual framebuffer + WebKit driver
sudo apt install xvfb webkit2gtk-driver

# Run with Xvfb wrapper
xvfb-run npm run test:e2e
```

## Writing tests

Tests use WebdriverIO with Mocha. Specs go in `specs/`:

```typescript
import { browser, expect } from '@wdio/globals';

describe('BTerminal', () => {
  it('should show the status bar', async () => {
    const statusBar = await browser.$('[data-testid="status-bar"]');
    await expect(statusBar).toBeDisplayed();
  });
});
```

### Stable selectors

Prefer `data-testid` attributes over CSS class selectors:

| Element | Selector |
|---------|----------|
| Status bar | `[data-testid="status-bar"]` |
| Sidebar rail | `[data-testid="sidebar-rail"]` |
| Settings button | `[data-testid="settings-btn"]` |
| Project box | `[data-testid="project-box"]` |
| Project ID | `[data-project-id="..."]` |
| Project tabs | `[data-testid="project-tabs"]` |
| Agent session | `[data-testid="agent-session"]` |
| Agent pane | `[data-testid="agent-pane"]` |
| Agent status | `[data-agent-status="idle\|running\|..."]` |
| Agent messages | `[data-testid="agent-messages"]` |
| Agent prompt | `[data-testid="agent-prompt"]` |
| Agent submit | `[data-testid="agent-submit"]` |
| Agent stop | `[data-testid="agent-stop"]` |
| Terminal tabs | `[data-testid="terminal-tabs"]` |
| Add tab button | `[data-testid="tab-add"]` |
| Terminal toggle | `[data-testid="terminal-toggle"]` |
| Command palette | `[data-testid="command-palette"]` |
| Palette input | `[data-testid="palette-input"]` |

### Key constraints

- `maxInstances: 1` — Tauri doesn't support parallel WebDriver sessions
- Mocha timeout is 60s — the app needs time to initialize
- Tests interact with the real WebKit2GTK WebView, not a browser
- Use `browser.execute()` for JS clicks when WebDriver clicks don't trigger Svelte handlers
- Agent tests (Scenario 7) require a real Claude CLI install + API key — they skip gracefully if unavailable

## Test infrastructure

### Fixtures (`fixtures.ts`)

Creates isolated test environments with temp data/config dirs and git repos:

```typescript
import { createTestFixture, destroyTestFixture } from '../fixtures';

const fixture = createTestFixture('my-test');
// fixture.dataDir, fixture.configDir, fixture.projectDir, fixture.env
destroyTestFixture(fixture);
```

### Results DB (`results-db.ts`)

JSON-based test results store for tracking runs and steps:

```typescript
import { ResultsDb } from '../results-db';

const db = new ResultsDb();
db.startRun('run-001', 'v2-mission-control', 'abc123');
db.recordStep({ run_id: 'run-001', scenario_name: 'Smoke', step_name: 'renders', status: 'passed', ... });
db.finishRun('run-001', 'passed', 5000);
```

## File structure

```
tests/e2e/
├── README.md                         # This file
├── wdio.conf.js                      # WebdriverIO config with tauri-driver lifecycle
├── tsconfig.json                     # TypeScript config for test specs
├── fixtures.ts                       # Test fixture generator (isolated environments)
├── results-db.ts                     # JSON test results store
└── specs/
    ├── bterminal.test.ts             # Smoke tests (CSS class selectors, 50+ tests)
    └── agent-scenarios.test.ts       # Phase A scenarios (data-testid selectors, 22 tests)
```

## References

- Tauri WebDriver docs: https://v2.tauri.app/develop/tests/webdriver/
- WebdriverIO docs: https://webdriver.io/
- tauri-driver: https://crates.io/crates/tauri-driver
