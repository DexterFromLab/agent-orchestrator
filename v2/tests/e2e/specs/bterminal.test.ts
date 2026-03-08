import { browser, expect } from '@wdio/globals';

// All E2E tests run in a single spec file because Tauri launches one app
// instance per session, and tauri-driver doesn't support re-creating sessions.

describe('BTerminal — Smoke Tests', () => {
  it('should render the application window', async () => {
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

  it('should show project-level tabs (Claude, Files, Context)', async () => {
    const box = await browser.$('.project-box');
    const tabs = await box.$$('.ptab');
    expect(tabs.length).toBe(3);
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
    expect(text.toLowerCase()).toContain('files');

    // Switch back to Claude tab
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

  it('should display agent count in status bar', async () => {
    const statusBar = await browser.$('.status-bar .left');
    const text = await statusBar.getText();
    expect(text).toContain('agents');
  });
});

describe('BTerminal — Settings Panel', () => {
  before(async () => {
    // Open settings panel
    const settingsBtn = await browser.$('.rail-btn');
    await settingsBtn.click();
    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 5000 });
  });

  after(async () => {
    // Close settings if still open — use keyboard shortcut as most reliable method
    const panel = await browser.$('.sidebar-panel');
    if (await panel.isDisplayed()) {
      await browser.keys('Escape');
      await browser.pause(500);
    }
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
    const groupList = await browser.$('.group-list');
    await expect(groupList).toBeDisplayed();
  });

  it('should close settings panel with close button', async () => {
    // Ensure settings is open
    const panel = await browser.$('.sidebar-panel');
    if (!(await panel.isDisplayed())) {
      const settingsBtn = await browser.$('.rail-btn');
      await settingsBtn.click();
      await panel.waitForDisplayed({ timeout: 3000 });
    }

    // Use JS click for reliability
    await browser.execute(() => {
      const btn = document.querySelector('.panel-close');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    await expect(panel).not.toBeDisplayed();
  });
});

describe('BTerminal — Keyboard Shortcuts', () => {
  it('should open command palette with Ctrl+K', async () => {
    // Focus the app window via JS to ensure keyboard events are received
    await browser.execute(() => document.body.focus());
    await browser.pause(200);
    await browser.keys(['Control', 'k']);

    const palette = await browser.$('.palette');
    await palette.waitForDisplayed({ timeout: 3000 });

    const input = await browser.$('.palette-input');
    await expect(input).toBeDisplayed();

    // Close with Escape
    await browser.keys('Escape');
    await palette.waitForDisplayed({ timeout: 3000, reverse: true });
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

  it('should show command palette with group list', async () => {
    await browser.keys(['Control', 'k']);

    const palette = await browser.$('.palette');
    await palette.waitForDisplayed({ timeout: 3000 });

    const items = await browser.$$('.palette-item');
    expect(items.length).toBeGreaterThanOrEqual(1);

    const groupName = await browser.$('.palette-item .group-name');
    await expect(groupName).toBeDisplayed();

    await browser.keys('Escape');
    await palette.waitForDisplayed({ timeout: 3000, reverse: true });
  });
});
