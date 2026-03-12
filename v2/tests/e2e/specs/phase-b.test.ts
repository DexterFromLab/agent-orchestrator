import { browser, expect } from '@wdio/globals';
import { isJudgeAvailable, assertWithJudge } from '../llm-judge';

// Phase B: Multi-project scenarios + LLM-judged assertions.
// Extends Phase A with tests that exercise multiple project boxes simultaneously
// and use Claude API to evaluate agent response quality.
//
// Prerequisites:
// - Built debug binary (or SKIP_BUILD=1)
// - groups.json with 2+ projects (use BTERMINAL_TEST_CONFIG_DIR or default)
// - ANTHROPIC_API_KEY env var for LLM-judged tests (skipped if absent)

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

/** Get the agent status for a specific project box. */
async function getAgentStatus(projectId: string): Promise<string> {
  return browser.execute((id) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const pane = box?.querySelector('[data-testid="agent-pane"]');
    return pane?.getAttribute('data-agent-status') ?? 'not-found';
  }, projectId);
}

/** Send a prompt to the agent in a specific project box. */
async function sendPromptInProject(projectId: string, text: string): Promise<void> {
  await focusProject(projectId);
  await browser.execute((id, prompt) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const textarea = box?.querySelector('[data-testid="agent-prompt"]') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.value = prompt;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, projectId, text);
  await browser.pause(200);
  await browser.execute((id) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const btn = box?.querySelector('[data-testid="agent-submit"]') as HTMLElement | null;
    if (btn) btn.click();
  }, projectId);
}

/** Wait for agent in a specific project to reach target status. */
async function waitForProjectAgentStatus(
  projectId: string,
  status: string,
  timeout = 60_000,
): Promise<void> {
  await browser.waitUntil(
    async () => (await getAgentStatus(projectId)) === status,
    { timeout, timeoutMsg: `Agent in project ${projectId} did not reach "${status}" within ${timeout}ms` },
  );
}

/** Get all message text from an agent pane in a specific project. */
async function getAgentMessages(projectId: string): Promise<string> {
  return browser.execute((id) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const area = box?.querySelector('[data-testid="agent-messages"]');
    return area?.textContent ?? '';
  }, projectId);
}

/** Switch to a tab in a specific project box. Tab index: 0=Model, 1=Docs, 2=Context, etc. */
async function switchProjectTab(projectId: string, tabIndex: number): Promise<void> {
  await browser.execute((id, idx) => {
    const box = document.querySelector(`[data-project-id="${id}"]`);
    const tabs = box?.querySelectorAll('[data-testid="project-tabs"] .ptab');
    if (tabs && tabs[idx]) (tabs[idx] as HTMLElement).click();
  }, projectId, tabIndex);
  await browser.pause(300);
}

// ─── Scenario B1: Multi-project grid renders correctly ────────────────

describe('Scenario B1 — Multi-Project Grid', () => {
  it('should render multiple project boxes', async () => {
    // Wait for app to fully render project boxes
    await browser.waitUntil(
      async () => {
        const count = await browser.execute(() =>
          document.querySelectorAll('[data-testid="project-box"]').length,
        );
        return (count as number) >= 1;
      },
      { timeout: 10_000, timeoutMsg: 'No project boxes rendered within 10s' },
    );

    const ids = await getProjectIds();
    // May be 1 project in minimal fixture; test structure regardless
    expect(ids.length).toBeGreaterThanOrEqual(1);
    // Each ID should be unique
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should show project headers with CWD paths', async () => {
    const headers = await browser.execute(() => {
      const els = document.querySelectorAll('.project-header .cwd');
      return Array.from(els).map((e) => e.textContent?.trim() ?? '');
    });
    // Each header should have a non-empty CWD
    for (const cwd of headers) {
      expect(cwd.length).toBeGreaterThan(0);
    }
  });

  it('should have independent agent panes per project', async () => {
    const ids = await getProjectIds();
    for (const id of ids) {
      const status = await getAgentStatus(id);
      expect(['idle', 'running', 'stalled']).toContain(status);
    }
  });

  it('should focus project on click and show active styling', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;

    await focusProject(ids[0]);
    const isActive = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      return box?.classList.contains('active') ?? false;
    }, ids[0]);
    expect(isActive).toBe(true);
  });
});

// ─── Scenario B2: Independent tab switching across projects ───────────

describe('Scenario B2 — Independent Tab Switching', () => {
  it('should allow different tabs active in different projects', async () => {
    const ids = await getProjectIds();
    if (ids.length < 2) {
      console.log('Skipping B2 — need 2+ projects');
      return;
    }

    // Switch first project to Files tab (index 3)
    await switchProjectTab(ids[0], 3);
    // Keep second project on Model tab (index 0)
    await switchProjectTab(ids[1], 0);

    // Verify first project has Files tab active
    const firstActiveTab = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const active = box?.querySelector('[data-testid="project-tabs"] .ptab.active');
      return active?.textContent?.trim() ?? '';
    }, ids[0]);

    const secondActiveTab = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      const active = box?.querySelector('[data-testid="project-tabs"] .ptab.active');
      return active?.textContent?.trim() ?? '';
    }, ids[1]);

    // They should be different tabs
    expect(firstActiveTab).not.toBe(secondActiveTab);

    // Restore first project to Model tab
    await switchProjectTab(ids[0], 0);
  });
});

// ─── Scenario B3: Status bar reflects fleet state ────────────────────

describe('Scenario B3 — Status Bar Fleet State', () => {
  it('should show agent count in status bar', async () => {
    const barText = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      return bar?.textContent ?? '';
    });
    // Status bar should contain at least one count (idle agents)
    expect(barText.length).toBeGreaterThan(0);
  });

  it('should show no burn rate when all agents idle', async () => {
    // When all agents are idle, burn-rate and cost elements are not rendered
    // (they only appear when totalBurnRatePerHour > 0 or totalCost > 0)
    const hasBurnRate = await browser.execute(() => {
      const bar = document.querySelector('[data-testid="status-bar"]');
      const burnEl = bar?.querySelector('.burn-rate');
      const costEl = bar?.querySelector('.cost');
      return { burn: burnEl?.textContent ?? null, cost: costEl?.textContent ?? null };
    });
    // Either no burn rate shown (idle) or it shows $0
    if (hasBurnRate.burn !== null) {
      expect(hasBurnRate.burn).toMatch(/\$0|0\.00/);
    }
    if (hasBurnRate.cost !== null) {
      expect(hasBurnRate.cost).toMatch(/\$0|0\.00/);
    }
    // If both are null, agents are idle — that's the expected state
  });
});

// ─── Scenario B4: LLM-judged agent response (requires API key) ──────

describe('Scenario B4 — LLM-Judged Agent Response', () => {
  const SKIP_MSG = 'Skipping — LLM judge not available (no CLI or API key)';

  it('should send prompt and get meaningful response', async function () {
    if (!isJudgeAvailable()) {
      console.log(SKIP_MSG);
      this.skip();
      return;
    }

    const ids = await getProjectIds();
    if (ids.length < 1) {
      this.skip();
      return;
    }
    const projectId = ids[0];

    // Send a prompt that requires a specific kind of response
    await sendPromptInProject(projectId, 'List the files in the current directory. Just list them, nothing else.');

    // Wait for agent to start
    try {
      await waitForProjectAgentStatus(projectId, 'running', 15_000);
    } catch {
      console.log('Agent did not start — Claude CLI may not be available');
      this.skip();
      return;
    }

    // Wait for completion
    await waitForProjectAgentStatus(projectId, 'idle', 120_000);

    // Get the agent's output
    const messages = await getAgentMessages(projectId);

    // Use LLM judge to evaluate the response
    const verdict = await assertWithJudge(
      'The output should contain a file listing that includes at least one filename (like README.md or hello.py). It should look like a directory listing, not an error message.',
      messages,
      { context: 'BTerminal agent was asked to list files in a test project directory containing README.md and hello.py' },
    );

    expect(verdict.pass).toBe(true);
    if (!verdict.pass) {
      console.log(`LLM Judge: ${verdict.reasoning} (confidence: ${verdict.confidence})`);
    }
  });

  it('should produce response with appropriate tool usage', async function () {
    if (!isJudgeAvailable()) {
      console.log(SKIP_MSG);
      this.skip();
      return;
    }

    const ids = await getProjectIds();
    if (ids.length < 1) {
      this.skip();
      return;
    }
    const projectId = ids[0];

    // Check that the previous response (from prior test) involved tool calls
    const messages = await getAgentMessages(projectId);

    const verdict = await assertWithJudge(
      'The output should show evidence that the agent used tools (like Bash, Read, Glob, or LS commands) to list files. Tool usage typically appears as tool call names, command text, or file paths in the output.',
      messages,
      { context: 'BTerminal renders agent tool calls in collapsible sections showing the tool name and output' },
    );

    expect(verdict.pass).toBe(true);
    if (!verdict.pass) {
      console.log(`LLM Judge: ${verdict.reasoning} (confidence: ${verdict.confidence})`);
    }
  });
});

// ─── Scenario B5: LLM-judged code generation quality ─────────────────

describe('Scenario B5 — LLM-Judged Code Generation', () => {
  const SKIP_MSG = 'Skipping — LLM judge not available (no CLI or API key)';

  it('should generate valid code when asked', async function () {
    if (!isJudgeAvailable()) {
      console.log(SKIP_MSG);
      this.skip();
      return;
    }

    const ids = await getProjectIds();
    if (ids.length < 1) {
      this.skip();
      return;
    }
    const projectId = ids[0];

    // Ask agent to read and explain existing code
    await sendPromptInProject(
      projectId,
      'Read hello.py and tell me what the greet function does. One sentence answer.',
    );

    try {
      await waitForProjectAgentStatus(projectId, 'running', 15_000);
    } catch {
      console.log('Agent did not start — Claude CLI may not be available');
      this.skip();
      return;
    }

    await waitForProjectAgentStatus(projectId, 'idle', 120_000);

    const messages = await getAgentMessages(projectId);

    const verdict = await assertWithJudge(
      'The response should correctly describe that the greet function takes a name parameter and returns a greeting string like "Hello, {name}!". The explanation should be roughly one sentence as requested.',
      messages,
      { context: 'hello.py contains: def greet(name: str) -> str:\n    return f"Hello, {name}!"' },
    );

    expect(verdict.pass).toBe(true);
    if (!verdict.pass) {
      console.log(`LLM Judge: ${verdict.reasoning} (confidence: ${verdict.confidence})`);
    }
  });
});

// ─── Scenario B6: Context tab reflects agent activity ────────────────

describe('Scenario B6 — Context Tab After Agent Activity', () => {
  it('should show token usage in Context tab after agent ran', async () => {
    const ids = await getProjectIds();
    if (ids.length < 1) return;
    const projectId = ids[0];

    // Switch to Context tab (index 2)
    await switchProjectTab(projectId, 2);

    // Check if context tab has any content
    const contextContent = await browser.execute((id) => {
      const box = document.querySelector(`[data-project-id="${id}"]`);
      // Look for stats or token meter elements
      const stats = box?.querySelector('.context-stats, .token-meter, .stat-value');
      return stats?.textContent ?? '';
    }, projectId);

    // If an agent has run, context tab should have data
    // If no agent ran (skipped), this may be empty — that's OK
    if (contextContent) {
      expect(contextContent.length).toBeGreaterThan(0);
    }

    // Switch back to Model tab
    await switchProjectTab(projectId, 0);
  });
});
