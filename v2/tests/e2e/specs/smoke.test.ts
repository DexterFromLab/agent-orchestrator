import { browser, expect } from '@wdio/globals';

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
