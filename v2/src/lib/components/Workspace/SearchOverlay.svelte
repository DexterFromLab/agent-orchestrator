<script lang="ts">
  import { onMount } from 'svelte';
  import { searchAll, type SearchResult } from '../../adapters/search-bridge';
  import { setActiveProject } from '../../stores/workspace.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Group results by type
  let groupedResults = $derived(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const key = r.resultType;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return groups;
  });

  const TYPE_LABELS: Record<string, string> = {
    message: 'Messages',
    task: 'Tasks',
    btmsg: 'Communications',
  };

  const TYPE_ICONS: Record<string, string> = {
    message: '\u{1F4AC}',  // speech balloon
    task: '\u{2611}',       // ballot box with check
    btmsg: '\u{1F4E8}',    // incoming envelope
  };

  $effect(() => {
    if (open && inputEl) {
      // Auto-focus when opened
      requestAnimationFrame(() => inputEl?.focus());
    }
    if (!open) {
      query = '';
      results = [];
      loading = false;
    }
  });

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!query.trim()) {
      results = [];
      loading = false;
      return;
    }

    loading = true;
    debounceTimer = setTimeout(async () => {
      try {
        results = await searchAll(query, 30);
      } catch {
        results = [];
      } finally {
        loading = false;
      }
    }, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('search-backdrop')) {
      onclose();
    }
  }

  function handleResultClick(result: SearchResult) {
    // Navigate based on result type
    if (result.resultType === 'message') {
      // result.id is session_id — focus the project that owns it
      setActiveProject(result.id);
    } else if (result.resultType === 'task') {
      // result.id is task_id — no direct project mapping, but close overlay
    } else if (result.resultType === 'btmsg') {
      // result.id is message_id — no direct navigation, but close overlay
    }
    onclose();
  }

  function highlightSnippet(snippet: string): string {
    // The Rust backend wraps matches in <b>...</b>
    // We sanitize everything else but preserve <b> tags
    return snippet
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;b&gt;/g, '<mark>')
      .replace(/&lt;\/b&gt;/g, '</mark>');
  }

  function formatScore(score: number): string {
    return score.toFixed(1);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="search-backdrop" onclick={handleBackdropClick}>
    <div class="search-overlay" onkeydown={handleKeydown}>
      <div class="search-input-row">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input
          bind:this={inputEl}
          class="search-input"
          type="text"
          value={query}
          oninput={handleInput}
          placeholder="Search across sessions, tasks, and messages..."
          spellcheck="false"
        />
        {#if loading}
          <div class="search-spinner"></div>
        {/if}
        <kbd class="search-kbd">Esc</kbd>
      </div>

      <div class="search-results">
        {#if results.length === 0 && !loading && query.trim()}
          <div class="search-empty">No results for "{query}"</div>
        {:else if results.length === 0 && !loading}
          <div class="search-empty">Search across sessions, tasks, and messages</div>
        {:else}
          {#each [...groupedResults()] as [type, items] (type)}
            <div class="result-group">
              <div class="result-group-header">
                <span class="group-icon">{TYPE_ICONS[type] ?? '?'}</span>
                <span class="group-label">{TYPE_LABELS[type] ?? type}</span>
                <span class="group-count">{items.length}</span>
              </div>
              {#each items as item (item.id + item.snippet)}
                <button class="result-item" onclick={() => handleResultClick(item)}>
                  <div class="result-main">
                    <span class="result-title">{item.title}</span>
                    <span class="result-snippet">{@html highlightSnippet(item.snippet)}</span>
                  </div>
                  <span class="result-score">{formatScore(item.score)}</span>
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .search-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ctp-crust) 70%, transparent);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
  }

  .search-overlay {
    width: 37.5rem;
    max-height: 60vh;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.75rem;
    box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--ctp-crust) 50%, transparent);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .search-icon {
    color: var(--ctp-overlay1);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--ctp-text);
    font-size: 0.9375rem;
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--ctp-overlay0);
  }

  .search-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--ctp-surface2);
    border-top-color: var(--ctp-blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .search-kbd {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--ctp-surface0);
    color: var(--ctp-overlay1);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    font-family: inherit;
    flex-shrink: 0;
  }

  .search-results {
    overflow-y: auto;
    flex: 1;
    padding: 0.25rem 0;
  }

  .search-empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--ctp-overlay0);
    font-size: 0.8125rem;
  }

  .result-group {
    padding: 0.25rem 0;
  }

  .result-group-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .group-icon {
    font-size: 0.75rem;
  }

  .group-count {
    margin-left: auto;
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-surface0);
    padding: 0 0.375rem;
    border-radius: 0.625rem;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
  }

  .result-item:hover {
    background: var(--ctp-surface0);
  }

  .result-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .result-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ctp-text);
    font-size: 0.8125rem;
  }

  .result-snippet {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ctp-subtext0);
    font-size: 0.75rem;
  }

  .result-snippet :global(mark) {
    background: color-mix(in srgb, var(--ctp-yellow) 25%, transparent);
    color: var(--ctp-yellow);
    border-radius: 0.125rem;
    padding: 0 0.125rem;
  }

  .result-score {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }
</style>
