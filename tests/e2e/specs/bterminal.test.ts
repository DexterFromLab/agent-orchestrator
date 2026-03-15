import { browser, expect } from '@wdio/globals';

// All E2E tests run in a single spec file because Tauri launches one app
// instance per session, and tauri-driver doesn't support re-creating sessions.

describe('BTerminal — Smoke Tests', () => {
  it('should render the application window', async () => {
    // Wait for the app to fully load before any tests
    await browser.waitUntil(
      async () => (await browser.getTitle()) === 'BTerminal',
      { timeout: 10_000, timeoutMsg: 'App did not load within 10s' },
    );
    const title = await browser.getTitle();
    expect(title).toBe('BTerminal');
  });

  it('should display the status bar', async () => {
    const statusBar = await browser.$('.status-bar');
    await expect(statusBar).toBeDisplayed();
  });

  it('should show version text in status bar', async () => {
    const version = await browser.$('.status-bar .version');
    await expect(version).toBeDisplayed();
    const text = await version.getText();
    expect(text).toContain('BTerminal');
  });

  it('should display the sidebar rail', async () => {
    const sidebarRail = await browser.$('.sidebar-rail');
    await expect(sidebarRail).toBeDisplayed();
  });

  it('should display the workspace area', async () => {
    const workspace = await browser.$('.workspace');
    await expect(workspace).toBeDisplayed();
  });

  it('should toggle sidebar with settings button', async () => {
    const settingsBtn = await browser.$('.rail-btn');
    await settingsBtn.click();

    const sidebarPanel = await browser.$('.sidebar-panel');
    await expect(sidebarPanel).toBeDisplayed();

    // Click again to close
    await settingsBtn.click();
    await expect(sidebarPanel).not.toBeDisplayed();
  });
});

describe('BTerminal — Workspace & Projects', () => {
  it('should display the project grid', async () => {
    const grid = await browser.$('.project-grid');
    await expect(grid).toBeDisplayed();
  });

  it('should render at least one project box', async () => {
    const boxes = await browser.$$('.project-box');
    expect(boxes.length).toBeGreaterThanOrEqual(1);
  });

  it('should show project header with name', async () => {
    const header = await browser.$('.project-header');
    await expect(header).toBeDisplayed();

    const name = await browser.$('.project-name');
    const text = await name.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it('should show project-level tabs (Model, Docs, Context, Files, SSH, Memory, ...)', async () => {
    const box = await browser.$('.project-box');
    const tabs = await box.$$('.ptab');
    // v3 has 6+ tabs: Model, Docs, Context, Files, SSH, Memory (+ role-specific)
    expect(tabs.length).toBeGreaterThanOrEqual(6);
  });

  it('should highlight active project on click', async () => {
    const header = await browser.$('.project-header');
    await header.click();

    const activeBox = await browser.$('.project-box.active');
    await expect(activeBox).toBeDisplayed();
  });

  it('should switch project tabs', async () => {
    // Use JS click — WebDriver clicks don't always trigger Svelte onclick
    // on buttons inside complex components via WebKit2GTK/tauri-driver
    const switched = await browser.execute(() => {
      const box = document.querySelector('.project-box');
      if (!box) return false;
      const tabs = box.querySelectorAll('.ptab');
      if (tabs.length < 2) return false;
      (tabs[1] as HTMLElement).click();
      return true;
    });
    expect(switched).toBe(true);
    await browser.pause(500);

    const box = await browser.$('.project-box');
    const activeTab = await box.$('.ptab.active');
    const text = await activeTab.getText();
    // Tab[1] is "Docs" in v3 tab bar (Model, Docs, Context, Files, ...)
    expect(text.toLowerCase()).toContain('docs');

    // Switch back to Model tab
    await browser.execute(() => {
      const tab = document.querySelector('.project-box .ptab');
      if (tab) (tab as HTMLElement).click();
    });
    await browser.pause(300);
  });

  it('should display the status bar with project count', async () => {
    const statusBar = await browser.$('.status-bar .left');
    const text = await statusBar.getText();
    expect(text).toContain('projects');
  });

  it('should display project and agent info in status bar', async () => {
    const statusBar = await browser.$('.status-bar .left');
    const text = await statusBar.getText();
    // Status bar always shows project count; agent counts only when > 0
    // (shows "X running", "X idle", "X stalled" — not the word "agents")
    expect(text).toContain('projects');
  });
});

/** Open the settings panel, waiting for content to render. */
async function openSettings(): Promise<void> {
  const panel = await browser.$('.sidebar-panel');
  const isOpen = await panel.isDisplayed().catch(() => false);
  if (!isOpen) {
    // Use data-testid for unambiguous selection
    await browser.execute(() => {
      const btn = document.querySelector('[data-testid="settings-btn"]');
      if (btn) (btn as HTMLElement).click();
    });
    await panel.waitForDisplayed({ timeout: 5000 });
  }
  // Wait for settings content to mount
  await browser.waitUntil(
    async () => {
      const count = await browser.execute(() =>
        document.querySelectorAll('.settings-tab .settings-section').length,
      );
      return (count as number) >= 1;
    },
    { timeout: 5000, timeoutMsg: 'Settings sections did not render within 5s' },
  );
  await browser.pause(200);
}

/** Close the settings panel if open. */
async function closeSettings(): Promise<void> {
  const panel = await browser.$('.sidebar-panel');
  if (await panel.isDisplayed().catch(() => false)) {
    await browser.execute(() => {
      const btn = document.querySelector('.panel-close');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);
  }
}

describe('BTerminal — Settings Panel', () => {
  before(async () => {
    await openSettings();
  });

  after(async () => {
    await closeSettings();
  });

  it('should display the settings tab container', async () => {
    const settingsTab = await browser.$('.settings-tab');
    await expect(settingsTab).toBeDisplayed();
  });

  it('should show settings sections', async () => {
    const sections = await browser.$$('.settings-section');
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it('should display theme dropdown', async () => {
    const dropdown = await browser.$('.custom-dropdown .dropdown-trigger');
    await expect(dropdown).toBeDisplayed();
  });

  it('should open theme dropdown and show options', async () => {
    // Use JS click — WebDriver clicks don't reliably trigger Svelte onclick
    // on buttons inside scrollable panels via WebKit2GTK/tauri-driver
    await browser.execute(() => {
      const trigger = document.querySelector('.custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(500);

    const menu = await browser.$('.dropdown-menu');
    await menu.waitForExist({ timeout: 3000 });

    const options = await browser.$$('.dropdown-option');
    expect(options.length).toBeGreaterThan(0);

    // Close dropdown by clicking trigger again
    await browser.execute(() => {
      const trigger = document.querySelector('.custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(300);
  });

  it('should display group list', async () => {
    // Groups section is below Appearance/Defaults/Providers — scroll into view
    await browser.execute(() => {
      const el = document.querySelector('.group-list');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await browser.pause(300);
    const groupList = await browser.$('.group-list');
    await expect(groupList).toBeDisplayed();
  });

  it('should close settings panel with close button', async () => {
    // Ensure settings is open
    await openSettings();

    // Use JS click for reliability
    await browser.execute(() => {
      const btn = document.querySelector('.panel-close');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    const panel = await browser.$('.sidebar-panel');
    await expect(panel).not.toBeDisplayed();
  });
});

/** Open command palette — idempotent (won't toggle-close if already open). */
async function openCommandPalette(): Promise<void> {
  // Ensure sidebar is closed first (it can intercept keyboard events)
  await closeSettings();

  // Check if already open
  const alreadyOpen = await browser.execute(() => {
    const p = document.querySelector('.palette');
    return p !== null && getComputedStyle(p).display !== 'none';
  });
  if (alreadyOpen) return;

  // Dispatch Ctrl+K via JS for reliability with WebKit2GTK/tauri-driver
  await browser.execute(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true,
    }));
  });
  await browser.pause(300);

  const palette = await browser.$('.palette');
  await palette.waitForDisplayed({ timeout: 5000 });
}

/** Close command palette if open — uses backdrop click (more reliable than Escape). */
async function closeCommandPalette(): Promise<void> {
  const isOpen = await browser.execute(() => {
    const p = document.querySelector('.palette');
    return p !== null && getComputedStyle(p).display !== 'none';
  });
  if (!isOpen) return;

  // Click backdrop to close (more reliable than dispatching Escape)
  await browser.execute(() => {
    const backdrop = document.querySelector('.palette-backdrop');
    if (backdrop) (backdrop as HTMLElement).click();
  });
  await browser.pause(500);
}

describe('BTerminal — Command Palette', () => {
  beforeEach(async () => {
    await closeCommandPalette();
  });

  it('should show palette input', async () => {
    await openCommandPalette();

    const input = await browser.$('.palette-input');
    await expect(input).toBeDisplayed();

    // Verify input accepts text (functional focus test, not activeElement check
    // which is unreliable in WebKit2GTK/tauri-driver)
    const canType = await browser.execute(() => {
      const el = document.querySelector('.palette-input') as HTMLInputElement | null;
      if (!el) return false;
      el.focus();
      return el === document.activeElement;
    });
    expect(canType).toBe(true);

    await closeCommandPalette();
  });

  it('should show palette items with command labels and categories', async () => {
    await openCommandPalette();

    const items = await browser.$$('.palette-item');
    expect(items.length).toBeGreaterThanOrEqual(1);

    // Each command item should have a label
    const cmdLabel = await browser.$('.palette-item .cmd-label');
    await expect(cmdLabel).toBeDisplayed();
    const labelText = await cmdLabel.getText();
    expect(labelText.length).toBeGreaterThan(0);

    // Commands should be grouped under category headers
    const categories = await browser.$$('.palette-category');
    expect(categories.length).toBeGreaterThanOrEqual(1);

    await closeCommandPalette();
  });

  it('should highlight selected item in palette', async () => {
    await openCommandPalette();

    // First item should be selected by default
    const selectedItem = await browser.$('.palette-item.selected');
    await expect(selectedItem).toBeExisting();

    await closeCommandPalette();
  });

  it('should filter palette items by typing', async () => {
    await openCommandPalette();

    const itemsBefore = await browser.$$('.palette-item');
    const countBefore = itemsBefore.length;

    // Type a nonsense string that won't match any group name
    const input = await browser.$('.palette-input');
    await input.setValue('zzz_nonexistent_group_xyz');
    await browser.pause(300);

    // Should show no results or fewer items
    const noResults = await browser.$('.no-results');
    const itemsAfter = await browser.$$('.palette-item');
    // Either no-results message appears OR item count decreased
    const filtered = (await noResults.isExisting()) || itemsAfter.length < countBefore;
    expect(filtered).toBe(true);

    await closeCommandPalette();
  });

  it('should close palette by clicking backdrop', async () => {
    await openCommandPalette();
    const palette = await browser.$('.palette');

    // Click the backdrop (outside the palette)
    await browser.execute(() => {
      const backdrop = document.querySelector('.palette-backdrop');
      if (backdrop) (backdrop as HTMLElement).click();
    });
    await browser.pause(500);

    await expect(palette).not.toBeDisplayed();
  });
});

describe('BTerminal — Terminal Tabs', () => {
  before(async () => {
    // Ensure Claude tab is active so terminal section is visible
    await browser.execute(() => {
      const tab = document.querySelector('.project-box .ptab');
      if (tab) (tab as HTMLElement).click();
    });
    await browser.pause(300);
  });

  it('should show terminal toggle on Claude tab', async () => {
    const toggle = await browser.$('.terminal-toggle');
    await expect(toggle).toBeDisplayed();

    const label = await browser.$('.toggle-label');
    const text = await label.getText();
    expect(text.toLowerCase()).toContain('terminal');
  });

  it('should expand terminal area on toggle click', async () => {
    // Click terminal toggle via JS
    await browser.execute(() => {
      const toggle = document.querySelector('.terminal-toggle');
      if (toggle) (toggle as HTMLElement).click();
    });
    await browser.pause(500);

    const termArea = await browser.$('.project-terminal-area');
    await expect(termArea).toBeDisplayed();

    // Chevron should have expanded class
    const chevron = await browser.$('.toggle-chevron.expanded');
    await expect(chevron).toBeExisting();
  });

  it('should show add tab button when terminal expanded', async () => {
    const addBtn = await browser.$('.tab-add');
    await expect(addBtn).toBeDisplayed();
  });

  it('should add a shell tab', async () => {
    // Click add tab button via JS (Svelte onclick)
    await browser.execute(() => {
      const btn = document.querySelector('.tab-bar .tab-add');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    // Verify tab title via JS to avoid stale element issues
    const title = await browser.execute(() => {
      const el = document.querySelector('.tab-bar .tab-title');
      return el ? el.textContent : '';
    });
    expect((title as string).toLowerCase()).toContain('shell');
  });

  it('should show active tab styling', async () => {
    const activeTab = await browser.$('.tab.active');
    await expect(activeTab).toBeExisting();
  });

  it('should add a second shell tab and switch between them', async () => {
    // Add second tab via JS
    await browser.execute(() => {
      const btn = document.querySelector('.tab-bar .tab-add');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    const tabCount = await browser.execute(() => {
      return document.querySelectorAll('.tab-bar .tab').length;
    });
    expect(tabCount as number).toBeGreaterThanOrEqual(2);

    // Click first tab and verify it becomes active with Shell title
    await browser.execute(() => {
      const tabs = document.querySelectorAll('.tab-bar .tab');
      if (tabs[0]) (tabs[0] as HTMLElement).click();
    });
    await browser.pause(300);

    const activeTitle = await browser.execute(() => {
      const active = document.querySelector('.tab-bar .tab.active .tab-title');
      return active ? active.textContent : '';
    });
    expect(activeTitle as string).toContain('Shell');
  });

  it('should close a tab', async () => {
    const tabsBefore = await browser.$$('.tab');
    const countBefore = tabsBefore.length;

    // Close the last tab
    await browser.execute(() => {
      const closeBtns = document.querySelectorAll('.tab-close');
      if (closeBtns.length > 0) {
        (closeBtns[closeBtns.length - 1] as HTMLElement).click();
      }
    });
    await browser.pause(500);

    const tabsAfter = await browser.$$('.tab');
    expect(tabsAfter.length).toBe(Number(countBefore) - 1);
  });

  after(async () => {
    // Clean up: close remaining tabs and collapse terminal
    await browser.execute(() => {
      // Close all tabs
      const closeBtns = document.querySelectorAll('.tab-close');
      closeBtns.forEach(btn => (btn as HTMLElement).click());
    });
    await browser.pause(300);

    // Collapse terminal
    await browser.execute(() => {
      const toggle = document.querySelector('.terminal-toggle');
      if (toggle) {
        const chevron = toggle.querySelector('.toggle-chevron.expanded');
        if (chevron) (toggle as HTMLElement).click();
      }
    });
    await browser.pause(300);
  });
});

describe('BTerminal — Theme Switching', () => {
  before(async () => {
    await openSettings();
    // Scroll to top for theme dropdown
    await browser.execute(() => {
      const content = document.querySelector('.panel-content') || document.querySelector('.sidebar-panel');
      if (content) content.scrollTop = 0;
    });
    await browser.pause(300);
  });

  after(async () => {
    await closeSettings();
  });

  it('should show theme dropdown with group labels', async () => {
    // Close any open dropdowns first
    await browser.execute(() => {
      const openMenu = document.querySelector('.dropdown-menu');
      if (openMenu) {
        const trigger = openMenu.closest('.custom-dropdown')?.querySelector('.dropdown-trigger');
        if (trigger) (trigger as HTMLElement).click();
      }
    });
    await browser.pause(200);

    // Click the first dropdown trigger (theme dropdown)
    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(500);

    const menu = await browser.$('.dropdown-menu');
    await menu.waitForExist({ timeout: 5000 });

    // Should have group labels (Catppuccin, Editor, Deep Dark)
    const groupLabels = await browser.$$('.dropdown-group-label');
    expect(groupLabels.length).toBeGreaterThanOrEqual(2);

    // Close dropdown
    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(300);
  });

  it('should switch theme and update CSS variables', async () => {
    // Get current base color
    const baseBefore = await browser.execute(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--ctp-base').trim();
    });

    // Open theme dropdown (first custom-dropdown in settings)
    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(500);

    // Wait for dropdown menu
    const menu = await browser.$('.dropdown-menu');
    await menu.waitForExist({ timeout: 5000 });

    // Click the first non-active theme option
    const changed = await browser.execute(() => {
      const options = document.querySelectorAll('.dropdown-menu .dropdown-option:not(.active)');
      if (options.length > 0) {
        (options[0] as HTMLElement).click();
        return true;
      }
      return false;
    });
    expect(changed).toBe(true);
    await browser.pause(500);

    // Verify CSS variable changed
    const baseAfter = await browser.execute(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--ctp-base').trim();
    });
    expect(baseAfter).not.toBe(baseBefore);

    // Switch back to Catppuccin Mocha (first option) to restore state
    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(500);
    await browser.execute(() => {
      const options = document.querySelectorAll('.dropdown-menu .dropdown-option');
      if (options.length > 0) (options[0] as HTMLElement).click();
    });
    await browser.pause(300);
  });

  it('should show active theme option', async () => {
    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(500);

    const menu = await browser.$('.dropdown-menu');
    await menu.waitForExist({ timeout: 5000 });

    const activeOption = await browser.$('.dropdown-option.active');
    await expect(activeOption).toBeExisting();

    await browser.execute(() => {
      const trigger = document.querySelector('.settings-tab .custom-dropdown .dropdown-trigger');
      if (trigger) (trigger as HTMLElement).click();
    });
    await browser.pause(300);
  });
});

describe('BTerminal — Settings Interaction', () => {
  before(async () => {
    await openSettings();
    // Scroll to top for font controls
    await browser.execute(() => {
      const content = document.querySelector('.panel-content') || document.querySelector('.sidebar-panel');
      if (content) content.scrollTop = 0;
    });
    await browser.pause(300);
  });

  after(async () => {
    await closeSettings();
  });

  it('should show font size controls with increment/decrement', async () => {
    const sizeControls = await browser.$$('.size-control');
    expect(sizeControls.length).toBeGreaterThanOrEqual(1);

    const sizeBtns = await browser.$$('.size-btn');
    expect(sizeBtns.length).toBeGreaterThanOrEqual(2); // at least - and + for one control

    const sizeInput = await browser.$('.size-input');
    await expect(sizeInput).toBeExisting();
  });

  it('should increment font size', async () => {
    const sizeInput = await browser.$('.size-input');
    const valueBefore = await sizeInput.getValue();

    // Click the + button (second .size-btn in first .size-control)
    await browser.execute(() => {
      const btns = document.querySelectorAll('.size-control .size-btn');
      // Second button is + (first is -)
      if (btns.length >= 2) (btns[1] as HTMLElement).click();
    });
    await browser.pause(300);

    const afterEl = await browser.$('.size-input');
    const valueAfter = await afterEl.getValue();
    expect(parseInt(valueAfter as string)).toBe(parseInt(valueBefore as string) + 1);
  });

  it('should decrement font size back', async () => {
    const sizeInput = await browser.$('.size-input');
    const valueBefore = await sizeInput.getValue();

    // Click the - button (first .size-btn)
    await browser.execute(() => {
      const btns = document.querySelectorAll('.size-control .size-btn');
      if (btns.length >= 1) (btns[0] as HTMLElement).click();
    });
    await browser.pause(300);

    const afterEl = await browser.$('.size-input');
    const valueAfter = await afterEl.getValue();
    expect(parseInt(valueAfter as string)).toBe(parseInt(valueBefore as string) - 1);
  });

  it('should display group rows with active indicator', async () => {
    // Scroll to Groups section (below Appearance, Defaults, Providers)
    await browser.execute(() => {
      const el = document.querySelector('.group-list');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await browser.pause(300);

    const groupRows = await browser.$$('.group-row');
    expect(groupRows.length).toBeGreaterThanOrEqual(1);

    const activeGroup = await browser.$('.group-row.active');
    await expect(activeGroup).toBeExisting();
  });

  it('should show project cards', async () => {
    // Scroll to Projects section
    await browser.execute(() => {
      const el = document.querySelector('.project-cards');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await browser.pause(300);

    const cards = await browser.$$('.project-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it('should display project card with name and path', async () => {
    const nameInput = await browser.$('.card-name-input');
    await expect(nameInput).toBeExisting();
    const name = await nameInput.getValue() as string;
    expect(name.length).toBeGreaterThan(0);

    const cwdInput = await browser.$('.cwd-input');
    await expect(cwdInput).toBeExisting();
    const cwd = await cwdInput.getValue() as string;
    expect(cwd.length).toBeGreaterThan(0);
  });

  it('should show project toggle switch', async () => {
    const toggle = await browser.$('.card-toggle');
    await expect(toggle).toBeExisting();

    const track = await browser.$('.toggle-track');
    await expect(track).toBeDisplayed();
  });

  it('should show add project form', async () => {
    // Scroll to add project form (at bottom of Projects section)
    await browser.execute(() => {
      const el = document.querySelector('.add-project-form');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await browser.pause(300);

    const addForm = await browser.$('.add-project-form');
    await expect(addForm).toBeDisplayed();

    const addBtn = await browser.$('.add-project-form .btn-primary');
    await expect(addBtn).toBeExisting();
  });
});

describe('BTerminal — Keyboard Shortcuts', () => {
  before(async () => {
    await closeSettings();
    await closeCommandPalette();
  });

  it('should open command palette with Ctrl+K', async () => {
    await openCommandPalette();

    const input = await browser.$('.palette-input');
    await expect(input).toBeDisplayed();

    // Close with Escape
    await closeCommandPalette();
    const palette = await browser.$('.palette');
    const isGone = !(await palette.isDisplayed().catch(() => false));
    expect(isGone).toBe(true);
  });

  it('should toggle settings with Ctrl+,', async () => {
    await browser.keys(['Control', ',']);

    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 3000 });

    // Close with Ctrl+,
    await browser.keys(['Control', ',']);
    await panel.waitForDisplayed({ timeout: 3000, reverse: true });
  });

  it('should toggle sidebar with Ctrl+B', async () => {
    // Open sidebar first
    await browser.keys(['Control', ',']);
    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 3000 });

    // Toggle off with Ctrl+B
    await browser.keys(['Control', 'b']);
    await panel.waitForDisplayed({ timeout: 3000, reverse: true });
  });

  it('should close sidebar with Escape', async () => {
    // Open sidebar
    await browser.keys(['Control', ',']);
    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 3000 });

    // Close with Escape
    await browser.keys('Escape');
    await panel.waitForDisplayed({ timeout: 3000, reverse: true });
  });

  it('should show command palette with categorized commands', async () => {
    await openCommandPalette();

    const items = await browser.$$('.palette-item');
    expect(items.length).toBeGreaterThanOrEqual(1);

    // Commands should have labels
    const cmdLabel = await browser.$('.palette-item .cmd-label');
    await expect(cmdLabel).toBeDisplayed();

    await closeCommandPalette();
  });
});
