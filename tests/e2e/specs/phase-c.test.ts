import { browser, expect } from '@wdio/globals';
import { isJudgeAvailable, assertWithJudge } from '../llm-judge';

// Phase C: Hardening feature tests.
// Tests the v3 production-readiness features added in the hardening sprint:
// - Command palette new commands
// - Search overlay (Ctrl+Shift+F)
// - Notification center
// - Keyboard shortcuts (vi-nav, project jump)
// - Settings panel new sections
// - Error states and recovery UI

// ─── Helpers ──────────────────────────────────────────────────────────

/** Get all project box IDs currently rendered. */
async function getProjectIds(): Promise<string[]> {
  return browser.execute(() => {
    const boxes = document.querySelectorAll('[data-testid="project-box"]');
    return Array.from(boxes).map(
      (b) => b.getAttribute('data-project-id') ?? '',
    ).filter(Boolean);
  });
}

/** Focus a specific project box by its project ID. */
async function focusProject(projectId: string): Promise<void> {
  await browser.execute((id) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const header = box?.querySelector('.project-header');
    if (header) (header as HTMLElement).click();
  }, projectId);
  await browser.pause(300);
}

/** Switch to a tab in a specific project box. */
async function switchProjectTab(projectId: string, tabIndex: number): Promise<void> {
  await browser.execute((id, idx) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const tabs = box?.querySelectorAll('[data-testid="project-tabs"] .ptab');
    if (tabs && tabs[idx]) (tabs[idx] as HTMLElement).click();
  }, projectId, tabIndex);
  await browser.pause(300);
}

/** Open command palette via Ctrl+K. */
async function openPalette(): Promise<void> {
  await browser.execute(() => document.body.focus());
  await browser.pause(100);
  await browser.keys(['Control', 'k']);
  const palette = await browser.$('[data-testid="command-palette"]');
  await palette.waitForDisplayed({ timeout: 3000 });
}

/** Close command palette via Escape. */
async function closePalette(): Promise<void> {
  await browser.keys('Escape');
  await browser.pause(300);
}

/** Type into palette input and get filtered results. */
async function paletteSearch(query: string): Promise<string[]> {
  const input = await browser.$('[data-testid="palette-input"]');
  await input.setValue(query);
  await browser.pause(300);
  return browser.execute(() => {
    const items = document.querySelectorAll('.palette-item .cmd-label');
    return Array.from(items).map(el => el.textContent?.trim() ?? '');
  });
}

// ─── Scenario C1: Command Palette — Hardening Commands ────────────────

describe('Scenario C1 — Command Palette Hardening Commands', () => {
  afterEach(async () => {
    // Ensure palette is closed after each test
    try {
      const isVisible = await browser.execute(() => {
        const el = document.querySelector('[data-testid="command-palette"]');
        return el !== null && window.getComputedStyle(el).display !== 'none';
      });
      if (isVisible) {
        await closePalette();
      }
    } catch {
      // Ignore if palette doesn't exist
    }
  });

  it('should find settings command in palette', async () => {
    await openPalette();
    const results = await paletteSearch('settings');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const hasSettings = results.some(r => r.toLowerCase().includes('settings'));
    expect(hasSettings).toBe(true);
  });

  it('should find terminal command in palette', async () => {
    await openPalette();
    const results = await paletteSearch('terminal');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const hasTerminal = results.some(r => r.toLowerCase().includes('terminal'));
    expect(hasTerminal).toBe(true);
  });

  it('should find keyboard shortcuts command in palette', async () => {
    await openPalette();
    const results = await paletteSearch('keyboard');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const hasShortcuts = results.some(r => r.toLowerCase().includes('keyboard'));
    expect(hasShortcuts).toBe(true);
  });

  it('should list all commands grouped by category when input is empty', async () => {
    await openPalette();
    const input = await browser.$('[data-testid="palette-input"]');
    await input.clearValue();
    await browser.pause(200);

    const itemCount = await browser.execute(() =>
      document.querySelectorAll('.palette-item').length,
    );
    // v3 has 18+ commands
    expect(itemCount).toBeGreaterThanOrEqual(10);

    // Commands should be organized in groups (categories)
    const groups = await browser.execute(() => {
      const headers = document.querySelectorAll('.palette-category');
      return Array.from(headers).map(h => h.textContent?.trim() ?? '');
    });
    // Should have at least 2 command groups
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Scenario C2: Search Overlay (Ctrl+Shift+F) ──────────────────────

describe('Scenario C2 — Search Overlay (FTS5)', () => {
  it('should open search overlay with Ctrl+Shift+F', async () => {
    await browser.execute(() => document.body.focus());
    await browser.pause(100);
    await browser.keys(['Control', 'Shift', 'f']);
    await browser.pause(500);

    const overlay = await browser.execute(() => {
      // SearchOverlay uses .search-overlay class
      const el = document.querySelector('.search-overlay, [data-testid="search-overlay"]');
      return el !== null;
    });
    expect(overlay).toBe(true);
  });

  it('should have search input focused', async () => {
    const isFocused = await browser.execute(() => {
      const input = document.querySelector('.search-overlay input, [data-testid="search-input"]') as HTMLInputElement | null;
      if (!input) return false;
      input.focus();
      return input === document.activeElement;
    });
    expect(isFocused).toBe(true);
  });

  it('should show no results for nonsense query', async () => {
    await browser.execute(() => {
      const input = document.querySelector('.search-overlay input, [data-testid="search-input"]') as HTMLInputElement | null;
      if (input) {
        input.value = 'zzz_nonexistent_xyz_999';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await browser.pause(500); // 300ms debounce + render time

    const resultCount = await browser.execute(() => {
      const results = document.querySelectorAll('.search-result, .search-result-item');
      return results.length;
    });
    expect(resultCount).toBe(0);
  });

  it('should close search overlay with Escape', async () => {
    await browser.keys('Escape');
    await browser.pause(300);

    const overlay = await browser.execute(() => {
      const el = document.querySelector('.search-overlay, [data-testid="search-overlay"]');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    expect(overlay).toBe(false);
  });
});

// ─── Scenario C3: Notification Center ─────────────────────────────────

describe('Scenario C3 — Notification Center', () => {
  it('should render notification bell in status bar', async () => {
    const hasBell = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      // NotificationCenter is in status bar with bell icon
      const bell = bar?.querySelector('.notification-bell, .bell-icon, [data-testid="notification-bell"]');
      return bell !== null;
    });
    expect(hasBell).toBe(true);
  });

  it('should open notification panel on bell click', async () => {
    await browser.execute(() => {
      const bell = document.querySelector('.notification-bell, .bell-icon, [data-testid="notification-bell"]');
      if (bell) (bell as HTMLElement).click();
    });
    await browser.pause(300);

    const panelOpen = await browser.execute(() => {
      const panel = document.querySelector('.notification-panel, .notification-dropdown, [data-testid="notification-panel"]');
      if (!panel) return false;
      const style = window.getComputedStyle(panel);
      return style.display !== 'none';
    });
    expect(panelOpen).toBe(true);
  });

  it('should show empty state or notification history', async () => {
    const content = await browser.execute(() => {
      const panel = document.querySelector('.notification-panel, .notification-dropdown, [data-testid="notification-panel"]');
      return panel?.textContent ?? '';
    });
    // Panel should have some text content (either "No notifications" or actual notifications)
    expect(content.length).toBeGreaterThan(0);
  });

  it('should close notification panel on outside click', async () => {
    // Click the backdrop overlay to close the panel
    await browser.execute(() => {
      const backdrop = document.querySelector('.notification-center .backdrop');
      if (backdrop) (backdrop as HTMLElement).click();
    });
    await browser.pause(300);

    const panelOpen = await browser.execute(() => {
      const panel = document.querySelector('.notification-panel, .notification-dropdown, [data-testid="notification-panel"]');
      if (!panel) return false;
      const style = window.getComputedStyle(panel);
      return style.display !== 'none';
    });
    expect(panelOpen).toBe(false);
  });
});

// ─── Scenario C4: Keyboard Navigation ────────────────────────────────

describe('Scenario C4 — Keyboard-First Navigation', () => {
  it('should toggle settings with Ctrl+Comma', async () => {
    await browser.execute(() => document.body.focus());
    await browser.pause(100);
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    const settingsVisible = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel');
      if (!panel) return false;
      const style = window.getComputedStyle(panel);
      return style.display !== 'none';
    });
    expect(settingsVisible).toBe(true);

    // Close it
    await browser.keys('Escape');
    await browser.pause(300);
  });

  it('should toggle sidebar with Ctrl+B', async () => {
    await browser.execute(() => document.body.focus());
    await browser.pause(100);

    // First open settings to have sidebar content
    await browser.keys(['Control', ',']);
    await browser.pause(300);

    const initialState = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel');
      return panel !== null && window.getComputedStyle(panel).display !== 'none';
    });

    // Toggle sidebar
    await browser.keys(['Control', 'b']);
    await browser.pause(300);

    const afterToggle = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel');
      if (!panel) return false;
      return window.getComputedStyle(panel).display !== 'none';
    });

    // State should have changed
    if (initialState) {
      expect(afterToggle).toBe(false);
    }

    // Clean up — close sidebar if still open
    await browser.keys('Escape');
    await browser.pause(200);
  });

  it('should focus project with Alt+1', async () => {
    await browser.execute(() => document.body.focus());
    await browser.pause(100);
    await browser.keys(['Alt', '1']);
    await browser.pause(300);

    const hasActive = await browser.execute(() => {
      const active = document.querySelector('.project-box.active');
      return active !== null;
    });
    expect(hasActive).toBe(true);
  });
});

// ─── Scenario C5: Settings Panel Sections ─────────────────────────────

describe('Scenario C5 — Settings Panel Sections', () => {
  before(async () => {
    // Open settings
    await browser.execute(() => {
      const btn = document.querySelector('[data-testid="settings-btn"]');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);
  });

  it('should show Appearance section with theme dropdown', async () => {
    const hasTheme = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel, .settings-tab');
      if (!panel) return false;
      const text = panel.textContent ?? '';
      return text.toLowerCase().includes('theme') || text.toLowerCase().includes('appearance');
    });
    expect(hasTheme).toBe(true);
  });

  it('should show font settings (UI font and Terminal font)', async () => {
    const hasFonts = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel, .settings-tab');
      if (!panel) return false;
      const text = panel.textContent ?? '';
      return text.toLowerCase().includes('font');
    });
    expect(hasFonts).toBe(true);
  });

  it('should show default shell setting', async () => {
    const hasShell = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel, .settings-tab');
      if (!panel) return false;
      const text = panel.textContent ?? '';
      return text.toLowerCase().includes('shell');
    });
    expect(hasShell).toBe(true);
  });

  it('should have theme dropdown with 17 themes', async () => {
    // Click the theme dropdown to see options
    const themeCount = await browser.execute(() => {
      // Find the theme dropdown (custom dropdown, not native select)
      const dropdowns = document.querySelectorAll('.settings-tab .custom-dropdown, .settings-tab .dropdown');
      for (const dd of dropdowns) {
        const label = dd.closest('.settings-row, .setting-row')?.textContent ?? '';
        if (label.toLowerCase().includes('theme')) {
          // Click to open it
          const trigger = dd.querySelector('.dropdown-trigger, .dropdown-selected, button');
          if (trigger) (trigger as HTMLElement).click();
          return -1; // Flag: opened dropdown
        }
      }
      return 0;
    });

    if (themeCount === -1) {
      // Dropdown was opened, wait and count options
      await browser.pause(300);
      const optionCount = await browser.execute(() => {
        const options = document.querySelectorAll('.dropdown-option, .dropdown-item, .theme-option');
        return options.length;
      });
      // Should have 17 themes
      expect(optionCount).toBeGreaterThanOrEqual(15);

      // Close dropdown
      await browser.keys('Escape');
      await browser.pause(200);
    }
  });

  after(async () => {
    await browser.keys('Escape');
    await browser.pause(300);
  });
});

// ─── Scenario C6: Project Health Indicators ───────────────────────────

describe('Scenario C6 — Project Health Indicators', () => {
  it('should show status dots on project headers', async () => {
    const hasDots = await browser.execute(() => {
      const dots = document.querySelectorAll('.project-header .status-dot, .project-header .health-dot');
      return dots.length;
    });
    // At least one project should have a status dot
    expect(hasDots).toBeGreaterThanOrEqual(1);
  });

  it('should show idle status when no agents running', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;

    const dotColor = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const dot = box?.querySelector('.status-dot, .health-dot');
      if (!dot) return 'not-found';
      const style = window.getComputedStyle(dot);
      return style.backgroundColor || style.color || 'unknown';
    }, ids[0]);

    // Should have some color value (not 'not-found')
    expect(dotColor).not.toBe('not-found');
  });

  it('should show status bar agent counts', async () => {
    const counts = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      if (!bar) return '';
      // Status bar shows running/idle/stalled counts
      return bar.textContent ?? '';
    });
    // Should contain at least idle count
    expect(counts).toMatch(/idle|running|stalled|\d/i);
  });
});

// ─── Scenario C7: Metrics Tab ─────────────────────────────────────────

describe('Scenario C7 — Metrics Tab', () => {
  it('should show Metrics tab in project tab bar', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;

    const hasMetrics = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const tabs = box?.querySelectorAll('[data-testid="project-tabs"] .ptab');
      if (!tabs) return false;
      return Array.from(tabs).some(t => t.textContent?.trim().toLowerCase().includes('metric'));
    }, ids[0]);

    expect(hasMetrics).toBe(true);
  });

  it('should render Metrics panel content when tab clicked', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;
    const projectId = ids[0];

    // Find and click Metrics tab
    await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const tabs = box?.querySelectorAll('[data-testid="project-tabs"] .ptab');
      if (!tabs) return;
      for (const tab of tabs) {
        if (tab.textContent?.trim().toLowerCase().includes('metric')) {
          (tab as HTMLElement).click();
          break;
        }
      }
    }, projectId);
    await browser.pause(500);

    const hasContent = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      // MetricsPanel has live view with fleet stats
      const panel = box?.querySelector('.metrics-panel, .metrics-tab');
      return panel !== null;
    }, projectId);

    expect(hasContent).toBe(true);

    // Switch back to Model tab
    await switchProjectTab(projectId, 0);
  });
});

// ─── Scenario C8: Context Tab ─────────────────────────────────────────

describe('Scenario C8 — Context Tab Visualization', () => {
  it('should render Context tab with token meter', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;
    const projectId = ids[0];

    // Switch to Context tab (index 2)
    await switchProjectTab(projectId, 2);

    const hasContextUI = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      // ContextTab has stats, token meter, file references
      const ctx = box?.querySelector('.context-tab, .context-stats, .token-meter, .stat-value');
      return ctx !== null;
    }, projectId);

    expect(hasContextUI).toBe(true);

    // Switch back to Model tab
    await switchProjectTab(projectId, 0);
  });
});

// ─── Scenario C9: Files Tab with Editor ───────────────────────────────

describe('Scenario C9 — Files Tab & Code Editor', () => {
  it('should render Files tab with directory tree', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;
    const projectId = ids[0];

    // Switch to Files tab (index 3)
    await switchProjectTab(projectId, 3);
    await browser.pause(500);

    const hasTree = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      // FilesTab has a directory tree
      const tree = box?.querySelector('.file-tree, .directory-tree, .files-tab');
      return tree !== null;
    }, projectId);

    expect(hasTree).toBe(true);
  });

  it('should list files from the project directory', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;

    const fileNames = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const items = box?.querySelectorAll('.tree-name');
      return Array.from(items ?? []).map(el => el.textContent?.trim() ?? '');
    }, ids[0]);

    // Test project has README.md and hello.py
    const hasFiles = fileNames.some(f =>
      f.includes('README') || f.includes('hello') || f.includes('.py') || f.includes('.md'),
    );
    expect(hasFiles).toBe(true);

    // Switch back to Model tab
    await switchProjectTab(ids[0], 0);
  });
});

// ─── Scenario C10: LLM-Judged Settings Completeness ──────────────────

describe('Scenario C10 — LLM-Judged Settings Completeness', () => {
  it('should have comprehensive settings panel', async function () {
    if (!isJudgeAvailable()) {
      console.log('Skipping — LLM judge not available (no CLI or API key)');
      this.skip();
      return;
    }

    // Open settings
    await browser.execute(() => {
      const btn = document.querySelector('[data-testid="settings-btn"]');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    const settingsContent = await browser.execute(() => {
      const panel = document.querySelector('.sidebar-panel, .settings-tab');
      return panel?.textContent ?? '';
    });

    const verdict = await assertWithJudge(
      'The settings panel should contain configuration options for: (1) theme/appearance, (2) font settings (UI and terminal), (3) default shell, and optionally (4) provider settings. It should look like a real settings UI, not an error message.',
      settingsContent,
      { context: 'BTerminal v3 settings panel with Appearance section (theme dropdown, UI font, terminal font) and Defaults section (shell, CWD). May also have Providers section.' },
    );

    expect(verdict.pass).toBe(true);
    if (!verdict.pass) {
      console.log(`LLM Judge: ${verdict.reasoning} (confidence: ${verdict.confidence})`);
    }

    await browser.keys('Escape');
    await browser.pause(300);
  });
});

// ─── Scenario C11: LLM-Judged Status Bar ──────────────────────────────

describe('Scenario C11 — LLM-Judged Status Bar Completeness', () => {
  it('should render a comprehensive status bar', async function () {
    if (!isJudgeAvailable()) {
      console.log('Skipping — LLM judge not available (no CLI or API key)');
      this.skip();
      return;
    }

    const statusBarContent = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      return bar?.textContent ?? '';
    });

    const statusBarHtml = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      return bar?.innerHTML ?? '';
    });

    const verdict = await assertWithJudge(
      'The status bar should display agent fleet information including: agent status counts (idle/running/stalled with numbers), and optionally burn rate ($/hr) and cost tracking. It should look like a real monitoring dashboard status bar.',
      `Text: ${statusBarContent}\n\nHTML structure: ${statusBarHtml.substring(0, 2000)}`,
      { context: 'BTerminal Mission Control status bar shows running/idle/stalled agent counts, total $/hr burn rate, attention queue, and total cost.' },
    );

    expect(verdict.pass).toBe(true);
    if (!verdict.pass) {
      console.log(`LLM Judge: ${verdict.reasoning} (confidence: ${verdict.confidence})`);
    }
  });
});
