import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// Debug binary path (built with `cargo tauri build --debug --no-bundle`)
// Cargo workspace target dir is at v2/target/, not v2/src-tauri/target/
const tauriBinary = resolve(projectRoot, 'target/debug/bterminal');

let tauriDriver;

export const config = {
  // ── Runner ──
  runner: 'local',
  maxInstances: 1, // Tauri doesn't support parallel sessions

  // ── Connection (external tauri-driver on port 4444) ──
  hostname: 'localhost',
  port: 4444,
  path: '/',

  // ── Specs ──
  // Single spec file — Tauri launches one app instance per session,
  // and tauri-driver can't re-create sessions between spec files.
  specs: [
    resolve(__dirname, 'specs/bterminal.test.ts'),
    resolve(__dirname, 'specs/agent-scenarios.test.ts'),
    resolve(__dirname, 'specs/phase-b.test.ts'),
  ],

  // ── Capabilities ──
  capabilities: [{
    // Disable BiDi negotiation — tauri-driver doesn't support webSocketUrl
    'wdio:enforceWebDriverClassic': true,
    'tauri:options': {
      application: tauriBinary,
      // Test isolation: separate data/config dirs, disable watchers/telemetry
      env: {
        BTERMINAL_TEST: '1',
        ...(process.env.BTERMINAL_TEST_DATA_DIR && { BTERMINAL_TEST_DATA_DIR: process.env.BTERMINAL_TEST_DATA_DIR }),
        ...(process.env.BTERMINAL_TEST_CONFIG_DIR && { BTERMINAL_TEST_CONFIG_DIR: process.env.BTERMINAL_TEST_CONFIG_DIR }),
      },
    },
  }],

  // ── Framework ──
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },

  // ── Reporter ──
  reporters: ['spec'],

  // ── Logging ──
  logLevel: 'warn',

  // ── Timeouts ──
  waitforTimeout: 10_000,
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 3,

  // ── Hooks ──

  /**
   * Build the debug binary before the test run.
   * Uses --debug --no-bundle for fastest build time.
   */
  onPrepare() {
    if (process.env.SKIP_BUILD) {
      console.log('SKIP_BUILD set — using existing debug binary.');
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      console.log('Building Tauri debug binary...');
      const build = spawn('cargo', ['tauri', 'build', '--debug', '--no-bundle'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
      build.on('close', (code) => {
        if (code === 0) {
          console.log('Debug binary ready.');
          resolve();
        } else {
          reject(new Error(`Tauri build failed with exit code ${code}`));
        }
      });
      build.on('error', reject);
    });
  },

  /**
   * Spawn tauri-driver before the session.
   * tauri-driver bridges WebDriver protocol to WebKit2GTK's inspector.
   * Uses TCP probe to confirm port 4444 is accepting connections.
   */
  beforeSession() {
    return new Promise((res, reject) => {
      tauriDriver = spawn('tauri-driver', [], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      tauriDriver.on('error', (err) => {
        reject(new Error(
          `Failed to start tauri-driver: ${err.message}. ` +
          'Install it with: cargo install tauri-driver'
        ));
      });

      // TCP readiness probe — poll port 4444 until it accepts a connection
      const maxWaitMs = 10_000;
      const intervalMs = 200;
      const deadline = Date.now() + maxWaitMs;

      function probe() {
        if (Date.now() > deadline) {
          reject(new Error('tauri-driver did not become ready within 10s'));
          return;
        }
        const sock = createConnection({ port: 4444, host: 'localhost' }, () => {
          sock.destroy();
          res();
        });
        sock.on('error', () => {
          sock.destroy();
          setTimeout(probe, intervalMs);
        });
      }

      // Give it a moment before first probe
      setTimeout(probe, 300);
    });
  },

  /**
   * Kill tauri-driver after the test run.
   */
  afterSession() {
    if (tauriDriver) {
      tauriDriver.kill();
      tauriDriver = null;
    }
  },

  // ── TypeScript (auto-compile via tsx) ──
  autoCompileOpts: {
    tsNodeOpts: {
      project: resolve(__dirname, 'tsconfig.json'),
    },
  },
};
