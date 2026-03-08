import { spawn } from 'node:child_process';
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
  specs: [resolve(__dirname, 'specs/**/*.test.ts')],

  // ── Capabilities ──
  capabilities: [{
    // Disable BiDi negotiation — tauri-driver doesn't support webSocketUrl
    'wdio:enforceWebDriverClassic': true,
    'tauri:options': {
      application: tauriBinary,
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
   * Spawn tauri-driver before each session.
   * tauri-driver bridges WebDriver protocol to WebKit2GTK's inspector.
   */
  beforeSession() {
    return new Promise((resolve, reject) => {
      tauriDriver = spawn('tauri-driver', [], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      tauriDriver.on('error', (err) => {
        reject(new Error(
          `Failed to start tauri-driver: ${err.message}. ` +
          'Install it with: cargo install tauri-driver'
        ));
      });

      // Wait for tauri-driver to be ready (listens on port 4444)
      const timeout = setTimeout(() => resolve(), 2000);
      tauriDriver.stdout.on('data', (data) => {
        if (data.toString().includes('4444')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  },

  /**
   * Kill tauri-driver after each session.
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
