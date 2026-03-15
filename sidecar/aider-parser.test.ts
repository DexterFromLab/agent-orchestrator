import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  looksLikePrompt,
  shouldSuppress,
  parseTurnOutput,
  extractSessionCost,
  prefetchContext,
  execShell,
  PROMPT_RE,
  SUPPRESS_RE,
  SHELL_CMD_RE,
} from './aider-parser';

// ---------------------------------------------------------------------------
// Fixtures — realistic Aider output samples used as format-drift canaries
// ---------------------------------------------------------------------------

const FIXTURE_STARTUP = [
  'Aider v0.72.1',
  'Main model: openrouter/anthropic/claude-sonnet-4 with diff edit format',
  'Weak model: openrouter/anthropic/claude-haiku-4',
  'Git repo: none',
  'Repo-map: disabled',
  'Use /help to see in-chat commands, run with --help to see cmd line args',
  '> ',
].join('\n');

const FIXTURE_SIMPLE_ANSWER = [
  '► THINKING',
  'The user wants me to check the task board.',
  '► ANSWER',
  'I will check the task board for you.',
  'bttask board',
  'Tokens: 1234 sent, 56 received.  Cost: $0.0023 message, $0.0045 session',
  '> ',
].join('\n');

const FIXTURE_CODE_BLOCK_SHELL = [
  'Here is the command to send a message:',
  '```bash',
  '$ btmsg send manager-001 "Task complete"',
  '```',
  'Tokens: 800 sent, 40 received.  Cost: $0.0010 message, $0.0021 session',
  'aider> ',
].join('\n');

const FIXTURE_MIXED_BLOCKS = [
  '► THINKING',
  'I need to check inbox then update the task.',
  '► ANSWER',
  'Let me check your inbox first.',
  'btmsg inbox',
  'Now updating the task status.',
  '```bash',
  'bttask status task-42 done',
  '```',
  'All done!',
  'Tokens: 2000 sent, 120 received.  Cost: $0.0040 message, $0.0080 session',
  'my-repo> ',
].join('\n');

const FIXTURE_APPLIED_EDIT_NOISE = [
  'I will edit the file.',
  'Applied edit to src/main.ts',
  'Fix any errors below',
  'Running: flake8 src/main.ts',
  'The edit is complete.',
  'Tokens: 500 sent, 30 received.  Cost: $0.0005 message, $0.0010 session',
  '> ',
].join('\n');

const FIXTURE_DOLLAR_PREFIX_SHELL = [
  'Run this command:',
  '$ git status',
  'After that, commit your changes.',
  '> ',
].join('\n');

const FIXTURE_RUNNING_PREFIX_SHELL = [
  'Running git log --oneline -5',
  'Tokens: 300 sent, 20 received.  Cost: $0.0003 message, $0.0006 session',
  '> ',
].join('\n');

const FIXTURE_NO_COST = [
  '► THINKING',
  'Checking the situation.',
  '► ANSWER',
  'Nothing to do right now.',
  '> ',
].join('\n');

// ---------------------------------------------------------------------------
// looksLikePrompt
// ---------------------------------------------------------------------------

describe('looksLikePrompt', () => {
  it('detects bare "> " prompt', () => {
    expect(looksLikePrompt('> ')).toBe(true);
  });

  it('detects "aider> " prompt', () => {
    expect(looksLikePrompt('aider> ')).toBe(true);
  });

  it('detects repo-named prompt like "my-repo> "', () => {
    expect(looksLikePrompt('my-repo> ')).toBe(true);
  });

  it('detects prompt after multi-line output', () => {
    const buffer = 'Some output line\nAnother line\naider> ';
    expect(looksLikePrompt(buffer)).toBe(true);
  });

  it('detects prompt when trailing blank lines follow', () => {
    const buffer = 'aider> \n\n';
    expect(looksLikePrompt(buffer)).toBe(true);
  });

  it('returns false for a full sentence ending in > but not a prompt', () => {
    expect(looksLikePrompt('This is greater than> something')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(looksLikePrompt('')).toBe(false);
  });

  it('returns false for string with only blank lines', () => {
    expect(looksLikePrompt('\n\n\n')).toBe(false);
  });

  it('returns false for plain text with no prompt', () => {
    expect(looksLikePrompt('I have analyzed the task and will now proceed.')).toBe(false);
  });

  it('handles dotted repo names like "my.project> "', () => {
    expect(looksLikePrompt('my.project> ')).toBe(true);
  });

  it('detects prompt in full startup fixture', () => {
    expect(looksLikePrompt(FIXTURE_STARTUP)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldSuppress
// ---------------------------------------------------------------------------

describe('shouldSuppress', () => {
  it('suppresses empty string', () => {
    expect(shouldSuppress('')).toBe(true);
  });

  it('suppresses whitespace-only string', () => {
    expect(shouldSuppress('   ')).toBe(true);
  });

  it('suppresses Aider version line', () => {
    expect(shouldSuppress('Aider v0.72.1')).toBe(true);
  });

  it('suppresses "Main model:" line', () => {
    expect(shouldSuppress('Main model: claude-sonnet-4 with diff format')).toBe(true);
  });

  it('suppresses "Weak model:" line', () => {
    expect(shouldSuppress('Weak model: claude-haiku-4')).toBe(true);
  });

  it('suppresses "Git repo:" line', () => {
    expect(shouldSuppress('Git repo: none')).toBe(true);
  });

  it('suppresses "Repo-map:" line', () => {
    expect(shouldSuppress('Repo-map: disabled')).toBe(true);
  });

  it('suppresses "Use /help" line', () => {
    expect(shouldSuppress('Use /help to see in-chat commands, run with --help to see cmd line args')).toBe(true);
  });

  it('does not suppress regular answer text', () => {
    expect(shouldSuppress('I will check the task board for you.')).toBe(false);
  });

  it('does not suppress a shell command line', () => {
    expect(shouldSuppress('bttask board')).toBe(false);
  });

  it('does not suppress a cost line', () => {
    expect(shouldSuppress('Tokens: 1234 sent, 56 received.  Cost: $0.0023 message, $0.0045 session')).toBe(false);
  });

  it('strips leading/trailing whitespace before testing', () => {
    expect(shouldSuppress('  Aider v0.70.0  ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTurnOutput — thinking blocks
// ---------------------------------------------------------------------------

describe('parseTurnOutput — thinking blocks', () => {
  it('extracts a thinking block using ► THINKING / ► ANSWER markers', () => {
    const blocks = parseTurnOutput(FIXTURE_SIMPLE_ANSWER);
    const thinking = blocks.filter(b => b.type === 'thinking');
    expect(thinking).toHaveLength(1);
    expect(thinking[0].content).toContain('check the task board');
  });

  it('extracts thinking with ▶ arrow variant', () => {
    const buffer = '▶ THINKING\nSome reasoning here.\n▶ ANSWER\nHere is the answer.\n> ';
    const blocks = parseTurnOutput(buffer);
    expect(blocks[0].type).toBe('thinking');
    expect(blocks[0].content).toContain('Some reasoning here.');
  });

  it('extracts thinking with > arrow variant', () => {
    const buffer = '> THINKING\nDeep thoughts.\n> ANSWER\nFinal answer.\n> ';
    const blocks = parseTurnOutput(buffer);
    const thinking = blocks.filter(b => b.type === 'thinking');
    expect(thinking).toHaveLength(1);
    expect(thinking[0].content).toContain('Deep thoughts.');
  });

  it('handles missing ANSWER marker — flushes thinking at end', () => {
    const buffer = '► THINKING\nIncomplete thinking block.\n> ';
    const blocks = parseTurnOutput(buffer);
    const thinking = blocks.filter(b => b.type === 'thinking');
    expect(thinking).toHaveLength(1);
    expect(thinking[0].content).toContain('Incomplete thinking block.');
  });

  it('produces no thinking block when no THINKING marker present', () => {
    const buffer = 'Just plain text.\n> ';
    const blocks = parseTurnOutput(buffer);
    expect(blocks.filter(b => b.type === 'thinking')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseTurnOutput — text blocks
// ---------------------------------------------------------------------------

describe('parseTurnOutput — text blocks', () => {
  it('extracts text after ANSWER marker', () => {
    const blocks = parseTurnOutput(FIXTURE_SIMPLE_ANSWER);
    const texts = blocks.filter(b => b.type === 'text');
    expect(texts.length).toBeGreaterThan(0);
    expect(texts[0].content).toContain('I will check the task board');
  });

  it('trims trailing whitespace from flushed text block', () => {
    // Note: parseTurnOutput checks PROMPT_RE against the trimmed line.
    // ">" (trimmed from "> ") does not match PROMPT_RE (which requires trailing space),
    // so the final flush trims the accumulated content via .trim().
    const buffer = 'Some text with trailing space.   ';
    const blocks = parseTurnOutput(buffer);
    const texts = blocks.filter(b => b.type === 'text');
    expect(texts[0].content).toBe('Some text with trailing space.');
  });

  it('does not produce a text block from suppressed startup lines alone', () => {
    // All Aider startup lines are suppressed by SUPPRESS_RE.
    // The ">" (trimmed from "> ") does NOT match PROMPT_RE (requires trailing space),
    // but it is also not a recognized command or thinking marker, so it lands in answerLines.
    // The final text block is trimmed — ">".trim() = ">", non-empty, so one text block with ">" appears.
    // What we care about is that suppressed startup noise does NOT appear in text.
    const buffer = [
      'Aider v0.72.1',
      'Main model: some-model',
    ].join('\n');
    const blocks = parseTurnOutput(buffer);
    expect(blocks.filter(b => b.type === 'text')).toHaveLength(0);
  });

  it('suppresses Applied edit / flake8 / Running: lines in answer text', () => {
    const blocks = parseTurnOutput(FIXTURE_APPLIED_EDIT_NOISE);
    const texts = blocks.filter(b => b.type === 'text');
    const combined = texts.map(b => b.content).join(' ');
    expect(combined).not.toContain('Applied edit');
    expect(combined).not.toContain('Fix any errors');
    expect(combined).not.toContain('Running:');
  });

  it('preserves non-suppressed text around noise lines', () => {
    const blocks = parseTurnOutput(FIXTURE_APPLIED_EDIT_NOISE);
    const texts = blocks.filter(b => b.type === 'text');
    const combined = texts.map(b => b.content).join(' ');
    expect(combined).toContain('I will edit the file');
    expect(combined).toContain('The edit is complete');
  });
});

// ---------------------------------------------------------------------------
// parseTurnOutput — shell blocks
// ---------------------------------------------------------------------------

describe('parseTurnOutput — shell blocks from code blocks', () => {
  it('extracts btmsg command from ```bash block', () => {
    const blocks = parseTurnOutput(FIXTURE_CODE_BLOCK_SHELL);
    const shells = blocks.filter(b => b.type === 'shell');
    expect(shells).toHaveLength(1);
    expect(shells[0].content).toBe('btmsg send manager-001 "Task complete"');
  });

  it('strips leading "$ " from commands inside code block', () => {
    const buffer = '```bash\n$ btmsg inbox\n```\n> ';
    const blocks = parseTurnOutput(buffer);
    const shells = blocks.filter(b => b.type === 'shell');
    expect(shells[0].content).toBe('btmsg inbox');
  });

  it('extracts commands from ```shell block', () => {
    const buffer = '```shell\nbttask board\n```\n> ';
    const blocks = parseTurnOutput(buffer);
    expect(blocks.filter(b => b.type === 'shell')).toHaveLength(1);
    expect(blocks.find(b => b.type === 'shell')!.content).toBe('bttask board');
  });

  it('extracts commands from plain ``` block (no language tag)', () => {
    const buffer = '```\nbtmsg inbox\n```\n> ';
    const blocks = parseTurnOutput(buffer);
    expect(blocks.filter(b => b.type === 'shell')).toHaveLength(1);
  });

  it('does not extract non-shell-command lines from code blocks', () => {
    const buffer = '```bash\nsome arbitrary text without a known prefix\n```\n> ';
    const blocks = parseTurnOutput(buffer);
    expect(blocks.filter(b => b.type === 'shell')).toHaveLength(0);
  });

  it('does not extract commands from ```python blocks', () => {
    const buffer = '```python\nbtmsg send something "hello"\n```\n> ';
    const blocks = parseTurnOutput(buffer);
    // Python blocks should not be treated as shell commands
    expect(blocks.filter(b => b.type === 'shell')).toHaveLength(0);
  });
});

describe('parseTurnOutput — shell blocks from inline prefixes', () => {
  it('detects "$ " prefix shell command', () => {
    const blocks = parseTurnOutput(FIXTURE_DOLLAR_PREFIX_SHELL);
    const shells = blocks.filter(b => b.type === 'shell');
    expect(shells).toHaveLength(1);
    expect(shells[0].content).toBe('git status');
  });

  it('detects "Running " prefix shell command', () => {
    const blocks = parseTurnOutput(FIXTURE_RUNNING_PREFIX_SHELL);
    const shells = blocks.filter(b => b.type === 'shell');
    expect(shells).toHaveLength(1);
    expect(shells[0].content).toBe('git log --oneline -5');
  });

  it('detects bare btmsg/bttask commands in ANSWER section', () => {
    const blocks = parseTurnOutput(FIXTURE_SIMPLE_ANSWER);
    const shells = blocks.filter(b => b.type === 'shell');
    expect(shells.some(s => s.content === 'bttask board')).toBe(true);
  });

  it('does not extract bare commands from THINKING section', () => {
    const buffer = '► THINKING\nbtmsg inbox\n► ANSWER\nDone.\n> ';
    const blocks = parseTurnOutput(buffer);
    // btmsg inbox in thinking section should be accumulated as thinking, not shell
    expect(blocks.filter(b => b.type === 'shell')).toHaveLength(0);
  });

  it('flushes preceding text block before a shell block', () => {
    const blocks = parseTurnOutput(FIXTURE_DOLLAR_PREFIX_SHELL);
    const textIdx = blocks.findIndex(b => b.type === 'text');
    const shellIdx = blocks.findIndex(b => b.type === 'shell');
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(shellIdx).toBeGreaterThan(textIdx);
  });
});

// ---------------------------------------------------------------------------
// parseTurnOutput — cost blocks
// ---------------------------------------------------------------------------

describe('parseTurnOutput — cost blocks', () => {
  it('extracts cost line as a cost block', () => {
    const blocks = parseTurnOutput(FIXTURE_SIMPLE_ANSWER);
    const costs = blocks.filter(b => b.type === 'cost');
    expect(costs).toHaveLength(1);
    expect(costs[0].content).toContain('Cost:');
  });

  it('preserves the full cost line as content', () => {
    const costLine = 'Tokens: 1234 sent, 56 received.  Cost: $0.0023 message, $0.0045 session';
    const buffer = `Some text.\n${costLine}\n> `;
    const blocks = parseTurnOutput(buffer);
    const cost = blocks.find(b => b.type === 'cost');
    expect(cost?.content).toBe(costLine);
  });

  it('produces no cost block when no cost line present', () => {
    const blocks = parseTurnOutput(FIXTURE_NO_COST);
    expect(blocks.filter(b => b.type === 'cost')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseTurnOutput — mixed turn (thinking + text + shell + cost)
// ---------------------------------------------------------------------------

describe('parseTurnOutput — mixed blocks', () => {
  it('produces all four block types from a mixed turn', () => {
    const blocks = parseTurnOutput(FIXTURE_MIXED_BLOCKS);
    const types = blocks.map(b => b.type);
    expect(types).toContain('thinking');
    expect(types).toContain('text');
    expect(types).toContain('shell');
    expect(types).toContain('cost');
  });

  it('preserves block order: thinking → text → shell → text → cost', () => {
    const blocks = parseTurnOutput(FIXTURE_MIXED_BLOCKS);
    expect(blocks[0].type).toBe('thinking');
    // At least one shell block present
    const shellIdx = blocks.findIndex(b => b.type === 'shell');
    expect(shellIdx).toBeGreaterThan(0);
  });

  it('extracts both btmsg and bttask shell commands from mixed turn', () => {
    const blocks = parseTurnOutput(FIXTURE_MIXED_BLOCKS);
    const shells = blocks.filter(b => b.type === 'shell').map(b => b.content);
    expect(shells).toContain('btmsg inbox');
    expect(shells).toContain('bttask status task-42 done');
  });

  it('returns empty array for empty buffer', () => {
    expect(parseTurnOutput('')).toEqual([]);
  });

  it('returns empty array for buffer with only suppressed lines', () => {
    // All Aider startup noise is covered by SUPPRESS_RE.
    // A buffer of only suppressed lines produces no output blocks.
    const buffer = [
      'Aider v0.72.1',
      'Main model: claude-sonnet-4',
    ].join('\n');
    expect(parseTurnOutput(buffer)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractSessionCost
// ---------------------------------------------------------------------------

describe('extractSessionCost', () => {
  it('extracts session cost from a cost line', () => {
    const buffer = 'Tokens: 1234 sent, 56 received.  Cost: $0.0023 message, $0.0045 session\n> ';
    expect(extractSessionCost(buffer)).toBeCloseTo(0.0045);
  });

  it('returns 0 when no cost line present', () => {
    expect(extractSessionCost('Some answer without cost.\n> ')).toBe(0);
  });

  it('correctly picks session cost (second dollar amount), not message cost (first)', () => {
    const buffer = 'Cost: $0.0100 message, $0.0250 session';
    expect(extractSessionCost(buffer)).toBeCloseTo(0.0250);
  });

  it('handles zero cost values', () => {
    expect(extractSessionCost('Cost: $0.0000 message, $0.0000 session')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// prefetchContext — mocked child_process
// ---------------------------------------------------------------------------

describe('prefetchContext', () => {
  beforeEach(() => {
    vi.mock('child_process', () => ({
      execSync: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns inbox and board sections when both CLIs succeed', async () => {
    const { execSync } = await import('child_process');
    const mockExecSync = vi.mocked(execSync);
    mockExecSync
      .mockReturnValueOnce('Message from manager-001: fix bug' as never)
      .mockReturnValueOnce('task-1 | In Progress | Fix login bug' as never);

    const result = prefetchContext({ BTMSG_AGENT_ID: 'agent-001' }, '/tmp');

    expect(result).toContain('## Your Inbox');
    expect(result).toContain('Message from manager-001');
    expect(result).toContain('## Task Board');
    expect(result).toContain('task-1');
  });

  it('falls back to "No messages" when btmsg unavailable', async () => {
    const { execSync } = await import('child_process');
    const mockExecSync = vi.mocked(execSync);
    mockExecSync
      .mockImplementationOnce(() => { throw new Error('command not found'); })
      .mockReturnValueOnce('task-1 | todo' as never);

    const result = prefetchContext({}, '/tmp');

    expect(result).toContain('No messages (or btmsg unavailable).');
    expect(result).toContain('## Task Board');
  });

  it('falls back to "No tasks" when bttask unavailable', async () => {
    const { execSync } = await import('child_process');
    const mockExecSync = vi.mocked(execSync);
    mockExecSync
      .mockReturnValueOnce('inbox message' as never)
      .mockImplementationOnce(() => { throw new Error('command not found'); });

    const result = prefetchContext({}, '/tmp');

    expect(result).toContain('## Your Inbox');
    expect(result).toContain('No tasks (or bttask unavailable).');
  });

  it('falls back for both when both CLIs unavailable', async () => {
    const { execSync } = await import('child_process');
    const mockExecSync = vi.mocked(execSync);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });

    const result = prefetchContext({}, '/tmp');

    expect(result).toContain('No messages (or btmsg unavailable).');
    expect(result).toContain('No tasks (or bttask unavailable).');
  });

  it('wraps inbox content in fenced code block', async () => {
    const { execSync } = await import('child_process');
    const mockExecSync = vi.mocked(execSync);
    mockExecSync
      .mockReturnValueOnce('inbox line 1\ninbox line 2' as never)
      .mockReturnValueOnce('' as never);

    const result = prefetchContext({}, '/tmp');

    expect(result).toMatch(/```\ninbox line 1\ninbox line 2\n```/);
  });
});

// ---------------------------------------------------------------------------
// execShell — mocked child_process
// ---------------------------------------------------------------------------

describe('execShell', () => {
  beforeEach(() => {
    vi.mock('child_process', () => ({
      execSync: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns trimmed stdout and exitCode 0 on success', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('hello world\n' as never);

    const result = execShell('echo hello world', {}, '/tmp');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello world');
  });

  it('returns stderr content and non-zero exitCode on failure', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation(() => {
      const err = Object.assign(new Error('Command failed'), {
        stderr: 'No such file or directory',
        status: 127,
      });
      throw err;
    });

    const result = execShell('missing-cmd', {}, '/tmp');

    expect(result.exitCode).toBe(127);
    expect(result.stdout).toContain('No such file or directory');
  });

  it('falls back to stdout field on error if stderr is empty', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation(() => {
      const err = Object.assign(new Error('fail'), {
        stdout: 'partial output',
        stderr: '',
        status: 1,
      });
      throw err;
    });

    const result = execShell('cmd', {}, '/tmp');

    expect(result.stdout).toBe('partial output');
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Format-drift canary — realistic Aider output samples
// ---------------------------------------------------------------------------

describe('format-drift canary', () => {
  it('correctly parses a full realistic turn with thinking, commands, and cost', () => {
    // Represents what aider actually outputs in practice with --no-stream --no-pretty
    const realisticOutput = [
      '► THINKING',
      'The user needs me to check the inbox and act on any pending tasks.',
      'I should run btmsg inbox to see messages, then bttask board to see tasks.',
      '► ANSWER',
      'I will check your inbox and task board now.',
      '```bash',
      '$ btmsg inbox',
      '```',
      '```bash',
      '$ bttask board',
      '```',
      'Based on the results, I will proceed.',
      'Tokens: 3500 sent, 250 received.  Cost: $0.0070 message, $0.0140 session',
      'aider> ',
    ].join('\n');

    const blocks = parseTurnOutput(realisticOutput);
    const types = blocks.map(b => b.type);

    expect(types).toContain('thinking');
    expect(types).toContain('text');
    expect(types).toContain('shell');
    expect(types).toContain('cost');

    const shells = blocks.filter(b => b.type === 'shell').map(b => b.content);
    expect(shells).toContain('btmsg inbox');
    expect(shells).toContain('bttask board');

    expect(extractSessionCost(realisticOutput)).toBeCloseTo(0.0140);
  });

  it('startup fixture: looksLikePrompt matches after typical Aider startup output', () => {
    expect(looksLikePrompt(FIXTURE_STARTUP)).toBe(true);
  });

  it('startup fixture: all startup lines are suppressed by shouldSuppress', () => {
    const startupLines = [
      'Aider v0.72.1',
      'Main model: openrouter/anthropic/claude-sonnet-4 with diff edit format',
      'Weak model: openrouter/anthropic/claude-haiku-4',
      'Git repo: none',
      'Repo-map: disabled',
      'Use /help to see in-chat commands, run with --help to see cmd line args',
    ];
    for (const line of startupLines) {
      expect(shouldSuppress(line), `Expected shouldSuppress("${line}") to be true`).toBe(true);
    }
  });

  it('PROMPT_RE matches all expected prompt forms', () => {
    const validPrompts = ['> ', 'aider> ', 'my-repo> ', 'project.name> ', 'repo_123> '];
    for (const p of validPrompts) {
      expect(PROMPT_RE.test(p), `Expected PROMPT_RE to match "${p}"`).toBe(true);
    }
  });

  it('PROMPT_RE rejects non-prompt forms', () => {
    const notPrompts = ['> something', 'text> more text ', '>text', ''];
    for (const p of notPrompts) {
      expect(PROMPT_RE.test(p), `Expected PROMPT_RE not to match "${p}"`).toBe(false);
    }
  });

  it('SHELL_CMD_RE matches all documented command prefixes', () => {
    const cmds = [
      'btmsg send agent-001 "hello"',
      'bttask status task-42 done',
      'cat /etc/hosts',
      'ls -la',
      'find . -name "*.ts"',
      'grep -r "TODO" src/',
      'mkdir -p /tmp/test',
      'cd /home/user',
      'cp file.ts file2.ts',
      'mv old.ts new.ts',
      'rm -rf /tmp/test',
      'pip install requests',
      'npm install',
      'git status',
      'curl https://example.com',
      'wget https://example.com/file',
      'python script.py',
      'node index.js',
      'bash run.sh',
      'sh script.sh',
    ];
    for (const cmd of cmds) {
      expect(SHELL_CMD_RE.test(cmd), `Expected SHELL_CMD_RE to match "${cmd}"`).toBe(true);
    }
  });

  it('parseTurnOutput produces no shell blocks for non-shell code blocks (e.g. markdown python)', () => {
    const buffer = [
      'Here is example Python code:',
      '```python',
      'import os',
      'print(os.getcwd())',
      '```',
      '> ',
    ].join('\n');
    const shells = parseTurnOutput(buffer).filter(b => b.type === 'shell');
    expect(shells).toHaveLength(0);
  });

  it('cost regex format has not changed — still "Cost: $X.XX message, $Y.YY session"', () => {
    const costLine = 'Tokens: 1234 sent, 56 received.  Cost: $0.0023 message, $0.0045 session';
    expect(extractSessionCost(costLine)).toBeCloseTo(0.0045);
    // Verify the message cost is different from session cost (they're two separate values)
    const msgMatch = costLine.match(/Cost: \$([0-9.]+) message/);
    expect(msgMatch).not.toBeNull();
    expect(parseFloat(msgMatch![1])).toBeCloseTo(0.0023);
  });
});
