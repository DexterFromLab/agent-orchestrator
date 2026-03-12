import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// Debug binary path (built with `cargo tauri build --debug --no-bundle`)
// Cargo workspace target dir is at v2/target/, not v2/src-tauri/target/
const tauriBinary = resolve(projectRoot, 'target/debug/bterminal');

let tauriDriver;

// ── Test Fixture (created eagerly so env vars are available for capabilities) ──
const fixtureRoot = join(tmpdir(), `bterminal-e2e-${Date.now()}`);
const fixtureDataDir = join(fixtureRoot, 'data');
const fixtureConfigDir = join(fixtureRoot, 'config');
const fixtureProjectDir = join(fixtureRoot, 'test-project');

mkdirSync(fixtureDataDir, { recursive: true });
mkdirSync(fixtureConfigDir, { recursive: true });
mkdirSync(fixtureProjectDir, { recursive: true });

// Create a minimal git repo for agent testing
execSync('git init', { cwd: fixtureProjectDir, stdio: 'ignore' });
execSync('git config user.email "test@bterminal.dev"', { cwd: fixtureProjectDir, stdio: 'ignore' });
execSync('git config user.name "BTerminal Test"', { cwd: fixtureProjectDir, stdio: 'ignore' });
writeFileSync(join(fixtureProjectDir, 'README.md'), '# Test Project\n\nA simple test project for BTerminal E2E tests.\n');
writeFileSync(join(fixtureProjectDir, 'hello.py'), 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n');
execSync('git add -A && git commit -m "initial commit"', { cwd: fixtureProjectDir, stdio: 'ignore' });

// Write groups.json with one group containing the test project
writeFileSync(
  join(fixtureConfigDir, 'groups.json'),
  JSON.stringify({
    version: 1,
    groups: [{
      id: 'test-group',
      name: 'Test Group',
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        identifier: 'test-project',
        description: 'E2E test project',
        icon: '\uf120',
        cwd: fixtureProjectDir,
        profile: 'default',
        enabled: true,
      }],
      agents: [],
    }],
    activeGroupId: 'test-group',
  }, null, 2),
);

// Inject env vars into process.env so tauri-driver inherits them
// (tauri:options.env may not reliably set process-level env vars)
process.env.BTERMINAL_TEST = '1';
process.env.BTERMINAL_TEST_DATA_DIR = fixtureDataDir;
process.env.BTERMINAL_TEST_CONFIG_DIR = fixtureConfigDir;

console.log(`Test fixture created at ${fixtureRoot}`);

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
    resolve(__dirname, 'specs/phase-c.test.ts'),
  ],

  // ── Capabilities ──
  capabilities: [{
    // Disable BiDi negotiation — tauri-driver doesn't support webSocketUrl
    'wdio:enforceWebDriverClassic': true,
    'tauri:options': {
      application: tauriBinary,
      // Test isolation: fixture-created data/config dirs, disable watchers/telemetry
      env: {
        BTERMINAL_TEST: '1',
        BTERMINAL_TEST_DATA_DIR: fixtureDataDir,
        BTERMINAL_TEST_CONFIG_DIR: fixtureConfigDir,
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
    // Clean up test fixture
    try {
      rmSync(fixtureRoot, { recursive: true, force: true });
      console.log('Test fixture cleaned up.');
    } catch { /* best-effort cleanup */ }
  },

  // ── TypeScript (auto-compile via tsx) ──
  autoCompileOpts: {
    tsNodeOpts: {
      project: resolve(__dirname, 'tsconfig.json'),
    },
  },
};
