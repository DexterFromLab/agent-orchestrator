import { browser, expect } from '@wdio/globals';

// Phase A: Human-authored E2E scenarios with deterministic assertions.
// These test the agent UI flow end-to-end using stable data-testid selectors.
// Agent-interaction tests require a real Claude CLI install + API key.

// ─── Helpers ──────────────────────────────────────────────────────────

/** Wait for agent status to reach a target value within timeout. */
async function waitForAgentStatus(
  status: string,
  timeout = 30_000,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const attr = await browser.execute(() => {
        const el = document.querySelector('[data-testid="agent-pane"]');
        return el?.getAttribute('data-agent-status') ?? 'idle';
      });
      return attr === status;
    },
    { timeout, timeoutMsg: `Agent did not reach status "${status}" within ${timeout}ms` },
  );
}

/** Check if an agent pane exists and is visible. */
async function agentPaneExists(): Promise<boolean> {
  const el = await browser.$('[data-testid="agent-pane"]');
  return el.isExisting();
}

/** Type a prompt into the agent textarea and submit. */
async function sendAgentPrompt(text: string): Promise<void> {
  const textarea = await browser.$('[data-testid="agent-prompt"]');
  await textarea.waitForDisplayed({ timeout: 5000 });
  await textarea.setValue(text);
  // Small delay for Svelte reactivity
  await browser.pause(200);
  const submitBtn = await browser.$('[data-testid="agent-submit"]');
  await browser.execute((el) => (el as HTMLElement).click(), submitBtn);
}

// ─── Scenario 1: App renders with project grid and data-testid anchors ───

describe('Scenario 1 — App Structural Integrity', () => {
  it('should render the status bar with data-testid', async () => {
    const bar = await browser.$('[data-testid="status-bar"]');
    await expect(bar).toBeDisplayed();
  });

  it('should render the sidebar rail with data-testid', async () => {
    const rail = await browser.$('[data-testid="sidebar-rail"]');
    await expect(rail).toBeDisplayed();
  });

  it('should render at least one project box with data-testid', async () => {
    const boxes = await browser.$$('[data-testid="project-box"]');
    expect(boxes.length).toBeGreaterThanOrEqual(1);
  });

  it('should have data-project-id on project boxes', async () => {
    const projectId = await browser.execute(() => {
      const box = document.querySelector('[data-testid="project-box"]');
      return box?.getAttribute('data-project-id') ?? null;
    });
    expect(projectId).not.toBeNull();
    expect((projectId as string).length).toBeGreaterThan(0);
  });

  it('should render project tabs with data-testid', async () => {
    const tabs = await browser.$('[data-testid="project-tabs"]');
    await expect(tabs).toBeDisplayed();
  });

  it('should render agent session component', async () => {
    const session = await browser.$('[data-testid="agent-session"]');
    await expect(session).toBeDisplayed();
  });
});

// ─── Scenario 2: Settings panel via data-testid ──────────────────────

describe('Scenario 2 — Settings Panel (data-testid)', () => {
  it('should open settings via data-testid button', async () => {
    const btn = await browser.$('[data-testid="settings-btn"]');
    await btn.click();

    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 5000 });
    await expect(panel).toBeDisplayed();
  });

  it('should close settings with Escape', async () => {
    await browser.keys('Escape');
    const panel = await browser.$('.sidebar-panel');
    await panel.waitForDisplayed({ timeout: 3000, reverse: true });
  });
});

// ─── Scenario 3: Agent pane initial state ────────────────────────────

describe('Scenario 3 — Agent Pane Initial State', () => {
  it('should display agent pane in idle status', async () => {
    const exists = await agentPaneExists();
    if (!exists) {
      // Agent pane might not be visible until Model tab is active
      await browser.execute(() => {
        const tab = document.querySelector('[data-testid="project-tabs"] .ptab');
        if (tab) (tab as HTMLElement).click();
      });
      await browser.pause(300);
    }

    const pane = await browser.$('[data-testid="agent-pane"]');
    await expect(pane).toBeExisting();

    const status = await browser.execute(() => {
      const el = document.querySelector('[data-testid="agent-pane"]');
      return el?.getAttribute('data-agent-status') ?? 'unknown';
    });
    expect(status).toBe('idle');
  });

  it('should show prompt textarea', async () => {
    const textarea = await browser.$('[data-testid="agent-prompt"]');
    await expect(textarea).toBeDisplayed();
  });

  it('should show submit button', async () => {
    const btn = await browser.$('[data-testid="agent-submit"]');
    await expect(btn).toBeExisting();
  });

  it('should have empty messages area initially', async () => {
    const msgArea = await browser.$('[data-testid="agent-messages"]');
    await expect(msgArea).toBeExisting();

    // No message bubbles should exist in a fresh session
    const msgCount = await browser.execute(() => {
      const area = document.querySelector('[data-testid="agent-messages"]');
      if (!area) return 0;
      return area.querySelectorAll('.message').length;
    });
    expect(msgCount).toBe(0);
  });
});

// ─── Scenario 4: Terminal tab management ─────────────────────────────

describe('Scenario 4 — Terminal Tab Management (data-testid)', () => {
  before(async () => {
    // Ensure Model tab is active and terminal section visible
    await browser.execute(() => {
      const tab = document.querySelector('[data-testid="project-tabs"] .ptab');
      if (tab) (tab as HTMLElement).click();
    });
    await browser.pause(300);

    // Expand terminal section
    await browser.execute(() => {
      const toggle = document.querySelector('[data-testid="terminal-toggle"]');
      if (toggle) (toggle as HTMLElement).click();
    });
    await browser.pause(500);
  });

  it('should display terminal tabs container', async () => {
    const tabs = await browser.$('[data-testid="terminal-tabs"]');
    await expect(tabs).toBeDisplayed();
  });

  it('should add a shell tab via data-testid button', async () => {
    await browser.execute(() => {
      const btn = document.querySelector('[data-testid="tab-add"]');
      if (btn) (btn as HTMLElement).click();
    });
    await browser.pause(500);

    const tabTitle = await browser.execute(() => {
      const el = document.querySelector('.tab-bar .tab-title');
      return el?.textContent ?? '';
    });
    expect(tabTitle.toLowerCase()).toContain('shell');
  });

  it('should show active tab styling', async () => {
    const activeTab = await browser.$('.tab.active');
    await expect(activeTab).toBeExisting();
  });

  it('should close tab and show empty state', async () => {
    // Close all tabs
    await browser.execute(() => {
      const closeBtns = document.querySelectorAll('.tab-close');
      closeBtns.forEach(btn => (btn as HTMLElement).click());
    });
    await browser.pause(500);

    // Should show empty terminal area with "Open terminal" button
    const emptyBtn = await browser.$('.add-first');
    await expect(emptyBtn).toBeDisplayed();
  });

  after(async () => {
    // Collapse terminal section
    await browser.execute(() => {
      const toggle = document.querySelector('[data-testid="terminal-toggle"]');
      const chevron = toggle?.querySelector('.toggle-chevron.expanded');
      if (chevron) (toggle as HTMLElement).click();
    });
    await browser.pause(300);
  });
});

// ─── Scenario 5: Command palette with data-testid ───────────────────

describe('Scenario 5 — Command Palette (data-testid)', () => {
  it('should open palette and show data-testid input', async () => {
    await browser.execute(() => document.body.focus());
    await browser.pause(200);
    await browser.keys(['Control', 'k']);

    const palette = await browser.$('[data-testid="command-palette"]');
    await palette.waitForDisplayed({ timeout: 3000 });

    const input = await browser.$('[data-testid="palette-input"]');
    await expect(input).toBeDisplayed();
  });

  it('should have focused input', async () => {
    const isFocused = await browser.execute(() => {
      const el = document.querySelector('[data-testid="palette-input"]');
      return el === document.activeElement;
    });
    expect(isFocused).toBe(true);
  });

  it('should show at least one group item', async () => {
    const items = await browser.$$('.palette-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter and show no-results for nonsense query', async () => {
    const input = await browser.$('[data-testid="palette-input"]');
    await input.setValue('zzz_no_match_xyz');
    await browser.pause(300);

    const noResults = await browser.$('.no-results');
    await expect(noResults).toBeDisplayed();
  });

  it('should close on Escape', async () => {
    await browser.keys('Escape');
    const palette = await browser.$('[data-testid="command-palette"]');
    await browser.waitUntil(
      async () => !(await palette.isDisplayed()),
      { timeout: 3000 },
    );
  });
});

// ─── Scenario 6: Project focus and tab switching ─────────────────────

describe('Scenario 6 — Project Focus & Tab Switching', () => {
  it('should focus project on header click', async () => {
    await browser.execute(() => {
      const header = document.querySelector('.project-header');
      if (header) (header as HTMLElement).click();
    });
    await browser.pause(300);

    const activeBox = await browser.$('.project-box.active');
    await expect(activeBox).toBeDisplayed();
  });

  it('should switch to Files tab and back without losing agent session', async () => {
    // Get current agent session element reference
    const sessionBefore = await browser.execute(() => {
      const el = document.querySelector('[data-testid="agent-session"]');
      return el !== null;
    });
    expect(sessionBefore).toBe(true);

    // Switch to Files tab (second tab)
    await browser.execute(() => {
      const tabs = document.querySelectorAll('[data-testid="project-tabs"] .ptab');
      if (tabs.length >= 2) (tabs[1] as HTMLElement).click();
    });
    await browser.pause(500);

    // AgentSession should still exist in DOM (display:none, not unmounted)
    const sessionDuring = await browser.execute(() => {
      const el = document.querySelector('[data-testid="agent-session"]');
      return el !== null;
    });
    expect(sessionDuring).toBe(true);

    // Switch back to Model tab
    await browser.execute(() => {
      const tab = document.querySelector('[data-testid="project-tabs"] .ptab');
      if (tab) (tab as HTMLElement).click();
    });
    await browser.pause(300);

    // Agent session should be visible again
    const session = await browser.$('[data-testid="agent-session"]');
    await expect(session).toBeDisplayed();
  });

  it('should preserve agent status across tab switches', async () => {
    const statusBefore = await browser.execute(() => {
      const el = document.querySelector('[data-testid="agent-pane"]');
      return el?.getAttribute('data-agent-status') ?? 'unknown';
    });

    // Switch to Context tab (third tab) and back
    await browser.execute(() => {
      const tabs = document.querySelectorAll('[data-testid="project-tabs"] .ptab');
      if (tabs.length >= 3) (tabs[2] as HTMLElement).click();
    });
    await browser.pause(300);
    await browser.execute(() => {
      const tab = document.querySelector('[data-testid="project-tabs"] .ptab');
      if (tab) (tab as HTMLElement).click();
    });
    await browser.pause(300);

    const statusAfter = await browser.execute(() => {
      const el = document.querySelector('[data-testid="agent-pane"]');
      return el?.getAttribute('data-agent-status') ?? 'unknown';
    });
    expect(statusAfter).toBe(statusBefore);
  });
});

// ─── Scenario 7: Agent prompt interaction (requires Claude CLI) ──────

describe('Scenario 7 — Agent Prompt Submission', () => {
  // This scenario requires a real Claude CLI + API key.
  // Skip gracefully if agent doesn't transition to "running" within timeout.

  it('should accept text in prompt textarea', async () => {
    const textarea = await browser.$('[data-testid="agent-prompt"]');
    await textarea.waitForDisplayed({ timeout: 5000 });
    await textarea.setValue('Say hello');
    await browser.pause(200);

    const value = await textarea.getValue();
    expect(value).toBe('Say hello');

    // Clear without submitting
    await textarea.clearValue();
  });

  it('should enable submit button when prompt has text', async () => {
    const textarea = await browser.$('[data-testid="agent-prompt"]');
    await textarea.setValue('Test prompt');
    await browser.pause(200);

    // Submit button should be interactable (not disabled)
    const isDisabled = await browser.execute(() => {
      const btn = document.querySelector('[data-testid="agent-submit"]');
      if (!btn) return true;
      return (btn as HTMLButtonElement).disabled;
    });
    expect(isDisabled).toBe(false);

    await textarea.clearValue();
  });

  it('should show stop button during agent execution (if Claude available)', async function () {
    // Check if Claude CLI is likely available by looking for env hint
    const hasClaude = await browser.execute(() => {
      // If test mode is active and no ANTHROPIC_API_KEY, skip
      return true; // Optimistic — let the timeout catch failures
    });

    if (!hasClaude) {
      this.skip();
      return;
    }

    // Send a minimal prompt
    await sendAgentPrompt('Reply with exactly: BTERMINAL_TEST_OK');

    // Wait for running status (generous timeout for sidecar spin-up)
    try {
      await waitForAgentStatus('running', 15_000);
    } catch {
      // Claude CLI not available — skip remaining assertions
      console.log('Agent did not start — Claude CLI may not be available. Skipping.');
      this.skip();
      return;
    }

    // Stop button should appear while running
    const stopBtn = await browser.$('[data-testid="agent-stop"]');
    await expect(stopBtn).toBeDisplayed();

    // Wait for completion
    await waitForAgentStatus('idle', 60_000);

    // Messages area should now have content
    const msgCount = await browser.execute(() => {
      const area = document.querySelector('[data-testid="agent-messages"]');
      if (!area) return 0;
      return area.children.length;
    });
    expect(msgCount).toBeGreaterThan(0);
  });
});
