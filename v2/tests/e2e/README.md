# E2E Tests (WebDriver)

Tauri apps use the WebDriver protocol for E2E testing (not Playwright directly).
The app runs inside WebKit2GTK on Linux, so tests interact with the real WebView.

## Prerequisites

- Built Tauri app (`npm run tauri build`)
- Display server (X11 or Wayland) -- headless Xvfb works for CI
- `tauri-driver` installed (`cargo install tauri-driver`)
- WebdriverIO (`npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework`)

## Running

```bash
# Terminal 1: Start tauri-driver (bridges WebDriver to WebKit2GTK)
tauri-driver

# Terminal 2: Run tests
npm run test:e2e
```

## CI setup (headless)

```bash
# Install virtual framebuffer
sudo apt install xvfb

# Run with Xvfb wrapper
xvfb-run npm run test:e2e
```

## Writing tests

Tests use WebdriverIO. Example:

```typescript
import { browser } from '@wdio/globals';

describe('BTerminal', () => {
  it('should show the terminal pane on startup', async () => {
    const terminal = await browser.$('.terminal-pane');
    await expect(terminal).toBeDisplayed();
  });
});
```

## References

- Tauri WebDriver docs: https://v2.tauri.app/develop/tests/webdriver/
- WebdriverIO docs: https://webdriver.io/
- tauri-driver: https://crates.io/crates/tauri-driver
