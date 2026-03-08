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
```

The `wdio.conf.js` handles:
1. Building the debug binary (`cargo tauri build --debug --no-bundle`) in `onPrepare`
2. Spawning `tauri-driver` before each session
3. Killing `tauri-driver` after each session

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
    const statusBar = await browser.$('.status-bar');
    await expect(statusBar).toBeDisplayed();
  });
});
```

Key constraints:
- `maxInstances: 1` — Tauri doesn't support parallel WebDriver sessions
- Mocha timeout is 60s — the app needs time to initialize
- Tests interact with the real WebKit2GTK WebView, not a browser

## File structure

```
tests/e2e/
├── README.md          # This file
├── wdio.conf.js       # WebdriverIO config with tauri-driver lifecycle
├── tsconfig.json      # TypeScript config for test specs
└── specs/
    └── smoke.test.ts  # Basic smoke tests (app renders, sidebar toggle)
```

## References

- Tauri WebDriver docs: https://v2.tauri.app/develop/tests/webdriver/
- WebdriverIO docs: https://webdriver.io/
- tauri-driver: https://crates.io/crates/tauri-driver
