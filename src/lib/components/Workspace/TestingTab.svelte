<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { listDirectoryChildren, readFileContent, type DirEntry } from '../../adapters/files-bridge';

  interface Props {
    cwd: string;
    mode: 'selenium' | 'tests';
  }

  let { cwd, mode }: Props = $props();

  // ─── Selenium mode ────────────────────────────────────────
  let seleniumConnected = $state(false);
  let screenshots = $state<string[]>([]);
  let selectedScreenshot = $state<string | null>(null);
  let seleniumLog = $state<string[]>([]);
  let seleniumPollTimer: ReturnType<typeof setInterval> | null = null;

  const SCREENSHOTS_DIR = '.selenium/screenshots';
  const SELENIUM_LOG = '.selenium/session.log';

  async function loadSeleniumState() {
    const screenshotPath = `${cwd}/${SCREENSHOTS_DIR}`;
    try {
      const entries = await listDirectoryChildren(screenshotPath);
      const imageFiles = entries
        .filter(e => /\.(png|jpg|jpeg|webp)$/i.test(e.name))
        .map(e => e.path)
        .sort()
        .reverse();
      screenshots = imageFiles;

      // Select latest if nothing selected
      if (!selectedScreenshot && imageFiles.length > 0) {
        selectedScreenshot = imageFiles[0];
      }
      seleniumConnected = imageFiles.length > 0;
    } catch {
      screenshots = [];
      seleniumConnected = false;
    }

    // Load session log
    try {
      const content = await readFileContent(`${cwd}/${SELENIUM_LOG}`);
      if (content.type === 'Text') {
        seleniumLog = content.content.split('\n').filter(Boolean).slice(-50);
      }
    } catch {
      seleniumLog = [];
    }
  }

  // ─── Tests mode ───────────────────────────────────────────
  let testFiles = $state<DirEntry[]>([]);
  let selectedTestFile = $state<string | null>(null);
  let testOutput = $state('');
  let testRunning = $state(false);
  let lastTestResult = $state<'pass' | 'fail' | null>(null);

  const TEST_DIRS = ['tests', 'test', '__tests__', 'spec', 'e2e'];

  async function loadTestFiles() {
    for (const dir of TEST_DIRS) {
      try {
        const entries = await listDirectoryChildren(`${cwd}/${dir}`);
        const tests = entries.filter(e =>
          /\.(test|spec)\.(ts|js|py|rs)$/.test(e.name) ||
          /test_.*\.py$/.test(e.name)
        );
        if (tests.length > 0) {
          testFiles = tests;
          return;
        }
      } catch {
        // Directory doesn't exist, try next
      }
    }
    testFiles = [];
  }

  async function viewTestFile(filePath: string) {
    selectedTestFile = filePath;
    try {
      const content = await readFileContent(filePath);
      if (content.type === 'Text') {
        testOutput = content.content;
      }
    } catch (e) {
      testOutput = `Error: ${e}`;
    }
  }

  onMount(() => {
    if (mode === 'selenium') {
      loadSeleniumState();
      seleniumPollTimer = setInterval(loadSeleniumState, 3000);
    } else {
      loadTestFiles();
    }
  });

  onDestroy(() => {
    if (seleniumPollTimer) clearInterval(seleniumPollTimer);
  });
</script>

<div class="testing-tab">
  {#if mode === 'selenium'}
    <!-- Selenium Live View -->
    <div class="selenium-view">
      <div class="selenium-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Screenshots</span>
          <span class="status-dot" class:connected={seleniumConnected}></span>
        </div>
        <div class="screenshot-list">
          {#each screenshots as path}
            <button
              class="screenshot-item"
              class:active={selectedScreenshot === path}
              onclick={() => selectedScreenshot = path}
            >
              <span class="screenshot-name">{path.split('/').pop()}</span>
            </button>
          {/each}
          {#if screenshots.length === 0}
            <div class="empty-hint">
              No screenshots yet. The Tester agent saves screenshots to <code>{SCREENSHOTS_DIR}/</code>
            </div>
          {/if}
        </div>

        <div class="log-section">
          <div class="sidebar-header">
            <span class="sidebar-title">Session Log</span>
          </div>
          <div class="log-output">
            {#each seleniumLog as line}
              <div class="log-line">{line}</div>
            {/each}
            {#if seleniumLog.length === 0}
              <div class="empty-hint">No log entries</div>
            {/if}
          </div>
        </div>
      </div>

      <div class="selenium-content">
        {#if selectedScreenshot}
          <div class="screenshot-preview">
            <img
              src={convertFileSrc(selectedScreenshot)}
              alt="Selenium screenshot"
              class="screenshot-img"
            />
          </div>
        {:else}
          <div class="empty-state">
            Selenium screenshots will appear here during testing.
            <br />
            The Tester agent uses Selenium WebDriver for UI testing.
          </div>
        {/if}
      </div>
    </div>

  {:else}
    <!-- Automated Tests View -->
    <div class="tests-view">
      <div class="tests-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Test Files</span>
          {#if lastTestResult}
            <span class="result-badge" class:pass={lastTestResult === 'pass'} class:fail={lastTestResult === 'fail'}>
              {lastTestResult === 'pass' ? '✓ PASS' : '✗ FAIL'}
            </span>
          {/if}
        </div>
        <div class="test-file-list">
          {#each testFiles as file (file.path)}
            <button
              class="test-file-item"
              class:active={selectedTestFile === file.path}
              onclick={() => viewTestFile(file.path)}
            >
              <span class="test-icon">🧪</span>
              <span class="test-name">{file.name}</span>
            </button>
          {/each}
          {#if testFiles.length === 0}
            <div class="empty-hint">
              No test files found. The Tester agent creates tests in standard directories (tests/, test/, spec/).
            </div>
          {/if}
        </div>
      </div>

      <div class="tests-content">
        {#if selectedTestFile}
          <div class="test-file-header">
            <span class="test-file-name">{selectedTestFile.split('/').pop()}</span>
          </div>
          <pre class="test-output">{testOutput}</pre>
        {:else}
          <div class="empty-state">
            Select a test file to view its contents.
            <br />
            The Tester agent runs tests via the terminal.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .testing-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* Shared sidebar patterns */
  .selenium-sidebar, .tests-sidebar {
    width: 12rem;
    flex-shrink: 0;
    border-right: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .sidebar-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ctp-overlay0);
  }

  .status-dot.connected {
    background: var(--ctp-green);
    box-shadow: 0 0 4px var(--ctp-green);
  }

  .empty-hint {
    padding: 0.5rem;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    line-height: 1.4;
  }

  .empty-hint code {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
    font-size: 0.6rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    text-align: center;
    line-height: 1.6;
    padding: 1rem;
  }

  /* Selenium view */
  .selenium-view, .tests-view {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .screenshot-list, .test-file-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .screenshot-item, .test-file-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3125rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.65rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .screenshot-item:hover, .test-file-item:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .screenshot-item.active, .test-file-item.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .screenshot-name, .test-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .test-icon { font-size: 0.75rem; }

  .log-section {
    border-top: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    max-height: 40%;
  }

  .log-output {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0.5rem;
  }

  .log-line {
    font-size: 0.6rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-subtext0);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .selenium-content, .tests-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .screenshot-preview {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.5rem;
    background: var(--ctp-mantle);
  }

  .screenshot-img {
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
  }

  /* Tests view */
  .result-badge {
    font-size: 0.55rem;
    font-weight: 700;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
  }

  .result-badge.pass {
    background: color-mix(in srgb, var(--ctp-green) 15%, transparent);
    color: var(--ctp-green);
  }

  .result-badge.fail {
    background: color-mix(in srgb, var(--ctp-red) 15%, transparent);
    color: var(--ctp-red);
  }

  .test-file-header {
    display: flex;
    align-items: center;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .test-file-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .test-output {
    flex: 1;
    overflow: auto;
    padding: 0.5rem;
    margin: 0;
    background: var(--ctp-mantle);
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    font-family: var(--term-font-family, monospace);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
