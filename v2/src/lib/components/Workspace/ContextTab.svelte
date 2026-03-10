<script lang="ts">
  import { getAgentSession, getTotalCost, type AgentSession } from '../../stores/agents.svelte';
  import type { AgentMessage, ToolCallContent, CostContent } from '../../adapters/sdk-messages';

  interface Props {
    sessionId: string | null;
  }

  let { sessionId }: Props = $props();

  // Reactive session data
  let session = $derived(sessionId ? getAgentSession(sessionId) : undefined);
  let messages = $derived(session?.messages ?? []);
  let totalCost = $derived(sessionId ? getTotalCost(sessionId) : { costUsd: 0, inputTokens: 0, outputTokens: 0 });

  // Context window size (Claude 3.5 Sonnet = 200k, Opus = 200k)
  const CONTEXT_WINDOW = 200_000;

  // --- Token category breakdown ---
  interface TokenCategory {
    label: string;
    tokens: number;
    color: string;
    pct: number;
  }

  let categories = $derived.by(() => {
    const msgs = messages;
    let toolCallTokens = 0;
    let toolResultTokens = 0;
    let textTokens = 0;
    let thinkingTokens = 0;
    let otherTokens = 0;

    for (const msg of msgs) {
      const est = estimateTokens(msg);
      switch (msg.type) {
        case 'tool_call': toolCallTokens += est; break;
        case 'tool_result': toolResultTokens += est; break;
        case 'text': textTokens += est; break;
        case 'thinking': thinkingTokens += est; break;
        default: otherTokens += est; break;
      }
    }

    const total = totalCost.inputTokens || (toolCallTokens + toolResultTokens + textTokens + thinkingTokens + otherTokens);
    if (total === 0) return [];

    const cats: TokenCategory[] = [];
    const add = (label: string, tokens: number, color: string) => {
      if (tokens > 0) cats.push({ label, tokens, color, pct: (tokens / CONTEXT_WINDOW) * 100 });
    };

    add('Assistant', textTokens, 'var(--ctp-green)');
    add('Thinking', thinkingTokens, 'var(--ctp-mauve)');
    add('Tool Calls', toolCallTokens, 'var(--ctp-peach)');
    add('Tool Results', toolResultTokens, 'var(--ctp-blue)');
    add('Other', otherTokens, 'var(--ctp-overlay1)');

    return cats;
  });

  let meterFillPct = $derived(() => {
    const total = totalCost.inputTokens;
    return total > 0 ? Math.min((total / CONTEXT_WINDOW) * 100, 100) : 0;
  });

  // --- Turn groups ---
  interface TurnGroup {
    index: number;
    userPrompt: string;
    messages: AgentMessage[];
    toolCalls: { name: string; input: string }[];
    estimatedTokens: number;
  }

  let turns = $derived.by(() => {
    const msgs = messages;
    const groups: TurnGroup[] = [];
    let current: TurnGroup | null = null;
    let turnIdx = 0;

    for (const msg of msgs) {
      if (msg.type === 'text' && !current) {
        // First text from assistant before any user prompt
        current = { index: turnIdx++, userPrompt: '(initial)', messages: [msg], toolCalls: [], estimatedTokens: 0 };
      } else if (msg.type === 'init' || msg.type === 'status') {
        if (current) current.messages.push(msg);
        else {
          current = { index: turnIdx++, userPrompt: '(session start)', messages: [msg], toolCalls: [], estimatedTokens: 0 };
        }
      } else if (msg.type === 'cost') {
        if (current) {
          current.messages.push(msg);
          groups.push(current);
          current = null;
        }
      } else {
        if (!current) {
          current = { index: turnIdx++, userPrompt: '', messages: [], toolCalls: [], estimatedTokens: 0 };
        }
        current.messages.push(msg);
        if (msg.type === 'tool_call') {
          const tc = msg.content as ToolCallContent;
          current.toolCalls.push({
            name: tc.name,
            input: typeof tc.input === 'string' ? tc.input.slice(0, 100) : JSON.stringify(tc.input).slice(0, 100),
          });
        }
      }
    }
    if (current && current.messages.length > 0) groups.push(current);

    // Compute estimated tokens per turn
    for (const g of groups) {
      g.estimatedTokens = g.messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    }

    return groups;
  });

  // --- File references ---
  interface FileRef {
    path: string;
    shortName: string;
    ops: Set<string>; // 'read', 'write', 'grep', 'bash', etc.
    count: number;
  }

  let fileRefs = $derived.by(() => {
    const refs = new Map<string, FileRef>();
    for (const msg of messages) {
      if (msg.type !== 'tool_call') continue;
      const tc = msg.content as ToolCallContent;
      const files = extractFilePaths(tc);
      for (const { path, op } of files) {
        const existing = refs.get(path);
        if (existing) {
          existing.ops.add(op);
          existing.count++;
        } else {
          refs.set(path, {
            path,
            shortName: path.split('/').pop() ?? path,
            ops: new Set([op]),
            count: 1,
          });
        }
      }
    }
    return Array.from(refs.values()).sort((a, b) => b.count - a.count);
  });

  // --- Helpers ---
  function estimateTokens(msg: AgentMessage): number {
    const content = msg.content;
    if (!content) return 0;
    if (msg.type === 'cost') return 0; // meta, not in context
    let text = '';
    if (typeof content === 'string') text = content;
    else if (typeof content === 'object' && content !== null) {
      if ('text' in content) text = String((content as Record<string, unknown>).text ?? '');
      else if ('output' in content) text = String((content as Record<string, unknown>).output ?? '');
      else if ('name' in content) text = JSON.stringify(content);
      else text = JSON.stringify(content);
    }
    // ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  function extractFilePaths(tc: ToolCallContent): { path: string; op: string }[] {
    const results: { path: string; op: string }[] = [];
    const input = tc.input as Record<string, unknown>;

    switch (tc.name) {
      case 'Read':
      case 'read':
        if (input?.file_path) results.push({ path: String(input.file_path), op: 'read' });
        break;
      case 'Write':
      case 'write':
        if (input?.file_path) results.push({ path: String(input.file_path), op: 'write' });
        break;
      case 'Edit':
      case 'edit':
        if (input?.file_path) results.push({ path: String(input.file_path), op: 'write' });
        break;
      case 'Glob':
      case 'glob':
        if (input?.pattern) results.push({ path: String(input.pattern), op: 'glob' });
        break;
      case 'Grep':
      case 'grep':
        if (input?.path) results.push({ path: String(input.path), op: 'grep' });
        break;
      case 'Bash':
      case 'bash':
        // Try to extract file paths from bash commands
        const cmd = String(input?.command ?? '');
        const fileMatch = cmd.match(/(?:cat|head|tail|less|vim|nano|code)\s+["']?([^\s"'|;&]+)/);
        if (fileMatch) results.push({ path: fileMatch[1], op: 'bash' });
        break;
    }
    return results;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  function formatCost(usd: number): string {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }

  function opColor(op: string): string {
    switch (op) {
      case 'read': return 'var(--ctp-blue)';
      case 'write': return 'var(--ctp-peach)';
      case 'grep': return 'var(--ctp-mauve)';
      case 'glob': return 'var(--ctp-teal)';
      case 'bash': return 'var(--ctp-yellow)';
      default: return 'var(--ctp-overlay1)';
    }
  }

  function msgTypeLabel(type: string): string {
    switch (type) {
      case 'text': return 'Assistant';
      case 'thinking': return 'Thinking';
      case 'tool_call': return 'Tool Call';
      case 'tool_result': return 'Tool Result';
      case 'init': return 'Init';
      case 'cost': return 'Cost';
      case 'error': return 'Error';
      case 'status': return 'Status';
      default: return type;
    }
  }

  function msgTypeColor(type: string): string {
    switch (type) {
      case 'text': return 'var(--ctp-green)';
      case 'thinking': return 'var(--ctp-mauve)';
      case 'tool_call': return 'var(--ctp-peach)';
      case 'tool_result': return 'var(--ctp-blue)';
      case 'error': return 'var(--ctp-red)';
      default: return 'var(--ctp-overlay1)';
    }
  }

  // Expanded turn tracking
  let expandedTurns = $state<Set<number>>(new Set());

  function toggleTurn(idx: number) {
    const next = new Set(expandedTurns);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    expandedTurns = next;
  }
</script>

<div class="context-tab">
  {#if !session}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <p class="empty-title">No active session</p>
      <p class="empty-hint">Start an agent session to see context window analysis</p>
    </div>
  {:else}
    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat">
        <span class="stat-value">{formatTokens(totalCost.inputTokens)}</span>
        <span class="stat-label">input</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatTokens(totalCost.outputTokens)}</span>
        <span class="stat-label">output</span>
      </div>
      <div class="stat">
        <span class="stat-value">{session.numTurns}</span>
        <span class="stat-label">turns</span>
      </div>
      <div class="stat">
        <span class="stat-value cost">{formatCost(totalCost.costUsd)}</span>
        <span class="stat-label">cost</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatDuration(session.durationMs)}</span>
        <span class="stat-label">time</span>
      </div>
      <div class="stat status-pill" class:running={session.status === 'running'} class:done={session.status === 'done'} class:error={session.status === 'error'}>
        <span class="stat-value">{session.status}</span>
      </div>
    </div>

    <!-- Context Meter -->
    <div class="meter-section">
      <div class="meter-header">
        <span class="meter-title">Context Window</span>
        <span class="meter-usage">{formatTokens(totalCost.inputTokens)} / {formatTokens(CONTEXT_WINDOW)}</span>
      </div>
      <div class="meter-bar">
        {#each categories as cat}
          <div
            class="meter-segment"
            style="width: {cat.pct}%; background: {cat.color}"
            title="{cat.label}: {formatTokens(cat.tokens)} ({cat.pct.toFixed(1)}%)"
          ></div>
        {/each}
        <div class="meter-empty" style="flex: 1"></div>
      </div>
      <div class="meter-legend">
        {#each categories as cat}
          <div class="legend-item">
            <span class="legend-dot" style="background: {cat.color}"></span>
            <span class="legend-label">{cat.label}</span>
            <span class="legend-value">{formatTokens(cat.tokens)}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- File References -->
    {#if fileRefs.length > 0}
      <div class="files-section">
        <div class="section-header">
          <span class="section-title">Files Touched</span>
          <span class="section-count">{fileRefs.length}</span>
        </div>
        <div class="files-list">
          {#each fileRefs.slice(0, 30) as ref (ref.path)}
            <div class="file-ref">
              <div class="file-ops">
                {#each Array.from(ref.ops) as op}
                  <span class="file-op" style="color: {opColor(op)}" title="{op}">{op[0].toUpperCase()}</span>
                {/each}
              </div>
              <span class="file-name" title={ref.path}>{ref.shortName}</span>
              <span class="file-count">{ref.count}×</span>
            </div>
          {/each}
          {#if fileRefs.length > 30}
            <div class="files-more">+{fileRefs.length - 30} more</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Turn Breakdown -->
    <div class="turns-section">
      <div class="section-header">
        <span class="section-title">Turns</span>
        <span class="section-count">{turns.length}</span>
      </div>
      <div class="turns-list">
        {#each turns as turn (turn.index)}
          <div class="turn-group">
            <button class="turn-header" onclick={() => toggleTurn(turn.index)}>
              <span class="turn-chevron" class:open={expandedTurns.has(turn.index)}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="turn-index">#{turn.index + 1}</span>
              <span class="turn-tools">
                {#each turn.toolCalls.slice(0, 3) as tc}
                  <span class="turn-tool-badge">{tc.name}</span>
                {/each}
                {#if turn.toolCalls.length > 3}
                  <span class="turn-tool-more">+{turn.toolCalls.length - 3}</span>
                {/if}
              </span>
              <span class="turn-tokens">{formatTokens(turn.estimatedTokens)}</span>
            </button>

            {#if expandedTurns.has(turn.index)}
              <div class="turn-detail">
                {#each turn.messages as msg}
                  {#if msg.type !== 'cost' && msg.type !== 'status' && msg.type !== 'init'}
                    <div class="turn-msg">
                      <span class="turn-msg-type" style="color: {msgTypeColor(msg.type)}">{msgTypeLabel(msg.type)}</span>
                      <span class="turn-msg-tokens">~{formatTokens(estimateTokens(msg))}</span>
                      {#if msg.type === 'tool_call'}
                        {@const tc = msg.content as ToolCallContent}
                        <span class="turn-msg-name">{tc.name}</span>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if turns.length === 0}
          <div class="turns-empty">No turns yet</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .context-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: var(--ctp-base);
    color: var(--ctp-text);
    gap: 0.125rem;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon { color: var(--ctp-overlay0); }
  .empty-title { font-size: 0.85rem; font-weight: 600; color: var(--ctp-subtext1); margin: 0; }
  .empty-hint { font-size: 0.7rem; color: var(--ctp-overlay0); margin: 0; }

  /* Stats bar */
  .stats-bar {
    display: flex;
    gap: 0.125rem;
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
    min-width: 3rem;
  }

  .stat-value {
    font-size: 0.75rem;
    font-weight: 700;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
  }

  .stat-value.cost { color: var(--ctp-green); }

  .stat-label {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-pill {
    margin-left: auto;
  }

  .status-pill.running { background: color-mix(in srgb, var(--ctp-green) 15%, transparent); }
  .status-pill.running .stat-value { color: var(--ctp-green); }
  .status-pill.done { background: color-mix(in srgb, var(--ctp-blue) 15%, transparent); }
  .status-pill.done .stat-value { color: var(--ctp-blue); }
  .status-pill.error { background: color-mix(in srgb, var(--ctp-red) 15%, transparent); }
  .status-pill.error .stat-value { color: var(--ctp-red); }

  /* Context meter */
  .meter-section {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .meter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
  }

  .meter-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
  }

  .meter-usage {
    font-size: 0.625rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
  }

  .meter-bar {
    display: flex;
    height: 1.25rem;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--ctp-surface0);
    gap: 1px;
  }

  .meter-segment {
    height: 100%;
    min-width: 2px;
    transition: width 0.4s ease;
    position: relative;
  }

  .meter-segment:hover {
    filter: brightness(1.2);
  }

  .meter-empty {
    background: transparent;
  }

  .meter-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem 0.75rem;
    margin-top: 0.375rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .legend-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 0.575rem;
    color: var(--ctp-overlay1);
  }

  .legend-value {
    font-size: 0.575rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-subtext0);
  }

  /* File references */
  .files-section {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
  }

  .section-count {
    font-size: 0.575rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.625rem;
    font-family: var(--term-font-family, monospace);
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 12rem;
    overflow-y: auto;
  }

  .file-ref {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.375rem;
    border-radius: 0.1875rem;
    transition: background 0.1s;
  }

  .file-ref:hover {
    background: var(--ctp-surface0);
  }

  .file-ops {
    display: flex;
    gap: 0.125rem;
    flex-shrink: 0;
  }

  .file-op {
    font-size: 0.5rem;
    font-weight: 700;
    font-family: var(--term-font-family, monospace);
    width: 0.875rem;
    height: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.125rem;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .file-name {
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .file-count {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
    flex-shrink: 0;
  }

  .files-more {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    padding: 0.25rem 0.375rem;
    text-align: center;
  }

  /* Turns */
  .turns-section {
    padding: 0.375rem 0.625rem;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .turns-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    flex: 1;
  }

  .turn-group {
    border-radius: 0.1875rem;
    overflow: hidden;
  }

  .turn-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.25rem 0.375rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-size: 0.65rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .turn-header:hover {
    background: var(--ctp-surface0);
  }

  .turn-chevron {
    flex-shrink: 0;
    color: var(--ctp-overlay0);
    transition: transform 0.15s;
    display: flex;
  }

  .turn-chevron.open {
    transform: rotate(90deg);
  }

  .turn-index {
    font-family: var(--term-font-family, monospace);
    font-size: 0.6rem;
    color: var(--ctp-overlay1);
    flex-shrink: 0;
    min-width: 1.5rem;
  }

  .turn-tools {
    display: flex;
    gap: 0.1875rem;
    flex: 1;
    overflow: hidden;
    flex-wrap: wrap;
  }

  .turn-tool-badge {
    font-size: 0.525rem;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
    background: color-mix(in srgb, var(--ctp-peach) 12%, transparent);
    color: var(--ctp-peach);
    font-family: var(--term-font-family, monospace);
    white-space: nowrap;
  }

  .turn-tool-more {
    font-size: 0.525rem;
    color: var(--ctp-overlay0);
  }

  .turn-tokens {
    font-size: 0.575rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
    flex-shrink: 0;
    margin-left: auto;
  }

  .turn-detail {
    padding: 0.1875rem 0.375rem 0.375rem 1.5rem;
    background: color-mix(in srgb, var(--ctp-surface0) 40%, transparent);
  }

  .turn-msg {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
    font-size: 0.6rem;
  }

  .turn-msg-type {
    font-weight: 600;
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-width: 4.5rem;
  }

  .turn-msg-tokens {
    font-family: var(--term-font-family, monospace);
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
  }

  .turn-msg-name {
    font-family: var(--term-font-family, monospace);
    font-size: 0.575rem;
    color: var(--ctp-subtext0);
  }

  .turns-empty {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    text-align: center;
    padding: 1rem;
  }
</style>
