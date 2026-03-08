<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ctxInitDb,
    ctxListProjects,
    ctxGetContext,
    ctxGetShared,
    ctxGetSummaries,
    ctxSearch,
    type CtxProject,
    type CtxEntry,
    type CtxSummary,
  } from '../../adapters/ctx-bridge';

  interface Props {
    onExit?: () => void;
  }

  let { onExit }: Props = $props();

  let projects = $state<CtxProject[]>([]);
  let selectedProject = $state<string | null>(null);
  let entries = $state<CtxEntry[]>([]);
  let sharedEntries = $state<CtxEntry[]>([]);
  let summaries = $state<CtxSummary[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<CtxEntry[]>([]);
  let error = $state('');
  let loading = $state(false);
  let dbMissing = $state(false);
  let initializing = $state(false);

  async function loadData() {
    try {
      projects = await ctxListProjects();
      sharedEntries = await ctxGetShared();
      error = '';
      dbMissing = false;
    } catch (e) {
      error = `${e}`;
      dbMissing = error.includes('not found');
    }
  }

  async function handleInitDb() {
    initializing = true;
    try {
      await ctxInitDb();
      await loadData();
    } catch (e) {
      error = `Failed to initialize database: ${e}`;
    } finally {
      initializing = false;
    }
  }

  onMount(loadData);

  async function selectProject(name: string) {
    selectedProject = name;
    loading = true;
    try {
      [entries, summaries] = await Promise.all([
        ctxGetContext(name),
        ctxGetSummaries(name, 5),
      ]);
      error = '';
    } catch (e) {
      error = `Failed to load context: ${e}`;
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    try {
      searchResults = await ctxSearch(searchQuery);
    } catch (e) {
      error = `Search failed: ${e}`;
    }
  }
</script>

<div class="context-pane">
  <div class="ctx-header">
    <h3>Context Manager</h3>
    <input
      type="text"
      class="search-input"
      placeholder="Search contexts..."
      bind:value={searchQuery}
      onkeydown={(e) => { if (e.key === 'Enter') handleSearch(); }}
    />
  </div>

  {#if error}
    <div class="ctx-error-box">
      <div class="ctx-error-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      {#if dbMissing}
        <div class="ctx-error-text">Context database not found</div>
        <div class="ctx-error-hint">
          Create the database at <code>~/.claude-context/context.db</code> to get started.
        </div>
        <button class="init-btn" onclick={handleInitDb} disabled={initializing}>
          {#if initializing}
            Initializing...
          {:else}
            Initialize Database
          {/if}
        </button>
      {:else}
        <div class="ctx-error-text">{error}</div>
      {/if}
    </div>
  {/if}

  <div class="ctx-body">
    {#if searchResults.length > 0}
      <div class="section">
        <h4>Search Results</h4>
        {#each searchResults as result}
          <div class="entry">
            <div class="entry-header">
              <span class="entry-project">{result.project}</span>
              <span class="entry-key">{result.key}</span>
            </div>
            <pre class="entry-value">{result.value}</pre>
          </div>
        {/each}
        <button class="clear-btn" onclick={() => { searchResults = []; searchQuery = ''; }}>Clear search</button>
      </div>
    {:else}
      <div class="project-list">
        <h4>Projects</h4>
        {#if projects.length === 0}
          <p class="empty">No projects registered. Use <code>ctx init</code> to add one.</p>
        {/if}
        {#each projects as project}
          <button
            class="project-btn"
            class:active={selectedProject === project.name}
            onclick={() => selectProject(project.name)}
          >
            <span class="project-name">{project.name}</span>
            <span class="project-desc">{project.description}</span>
          </button>
        {/each}
      </div>

      {#if sharedEntries.length > 0}
        <div class="section">
          <h4>Shared Context</h4>
          {#each sharedEntries as entry}
            <div class="entry">
              <div class="entry-header">
                <span class="entry-key">{entry.key}</span>
              </div>
              <pre class="entry-value">{entry.value}</pre>
            </div>
          {/each}
        </div>
      {/if}

      {#if selectedProject && !loading}
        <div class="section">
          <h4>{selectedProject} Context</h4>
          {#if entries.length === 0}
            <p class="empty">No context entries for this project.</p>
          {/if}
          {#each entries as entry}
            <div class="entry">
              <div class="entry-header">
                <span class="entry-key">{entry.key}</span>
                <span class="entry-date">{entry.updated_at}</span>
              </div>
              <pre class="entry-value">{entry.value}</pre>
            </div>
          {/each}
        </div>

        {#if summaries.length > 0}
          <div class="section">
            <h4>Recent Sessions</h4>
            {#each summaries as summary}
              <div class="entry">
                <div class="entry-header">
                  <span class="entry-date">{summary.created_at}</span>
                </div>
                <pre class="entry-value">{summary.summary}</pre>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      {#if loading}
        <div class="loading">Loading...</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .context-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .ctx-header {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ctx-header h3 {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .search-input {
    flex: 1;
    min-width: 10em;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-family: var(--term-font-family, monospace);
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--ctp-blue);
  }

  .ctx-error-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 1rem;
    text-align: center;
  }

  .ctx-error-icon {
    color: var(--ctp-overlay0);
  }

  .ctx-error-text {
    color: var(--ctp-red);
    font-size: 0.75rem;
  }

  .ctx-error-hint {
    color: var(--ctp-overlay1);
    font-size: 0.7rem;
  }

  .ctx-error-hint code {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.1875rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-green);
  }

  .init-btn {
    margin-top: 0.5rem;
    padding: 0.375rem 1rem;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .init-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .init-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ctx-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
  }

  .project-list {
    margin-bottom: 0.75rem;
  }

  h4 {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-mauve);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 0.375rem;
  }

  .project-btn {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.25rem;
    cursor: pointer;
    text-align: left;
    color: var(--ctp-text);
  }

  .project-btn:hover { border-color: var(--ctp-blue); }
  .project-btn.active {
    border-color: var(--ctp-blue);
    background: color-mix(in srgb, var(--ctp-blue) 10%, var(--ctp-surface0));
  }

  .project-name {
    font-weight: 600;
    font-size: 12px;
  }

  .project-desc {
    font-size: 10px;
    color: var(--ctp-overlay0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section {
    margin-bottom: 16px;
  }

  .entry {
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
    padding: 6px 8px;
    margin-bottom: 4px;
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .entry-project {
    font-size: 10px;
    color: var(--ctp-blue);
    font-weight: 600;
  }

  .entry-key {
    font-size: 11px;
    font-weight: 600;
    color: var(--ctp-green);
  }

  .entry-date {
    font-size: 9px;
    color: var(--ctp-overlay0);
    margin-left: auto;
  }

  .entry-value {
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ctp-subtext0);
    max-height: 200px;
    overflow-y: auto;
    margin: 0;
  }

  .empty {
    color: var(--ctp-overlay0);
    font-size: 11px;
    font-style: italic;
  }

  .clear-btn {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface0);
    color: var(--ctp-subtext0);
    border-radius: 0.25rem;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    margin-top: 4px;
  }

  .clear-btn:hover { color: var(--ctp-text); }

  .loading {
    color: var(--ctp-overlay0);
    font-size: 12px;
    text-align: center;
    padding: 16px;
  }
</style>
