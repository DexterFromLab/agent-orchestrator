<script lang="ts">
  import { discoverMarkdownFiles, type MdFileEntry } from '../../adapters/groups-bridge';
  import MarkdownPane from '../Markdown/MarkdownPane.svelte';

  interface Props {
    cwd: string;
    projectName: string;
  }

  let { cwd, projectName }: Props = $props();

  let files = $state<MdFileEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    loadFiles(cwd);
  });

  function handleNavigate(absolutePath: string) {
    // If the file is in our discovered list, select it directly
    const match = files.find(f => f.path === absolutePath);
    if (match) {
      selectedPath = absolutePath;
    } else {
      // File not in sidebar — set it directly (MarkdownPane handles loading)
      selectedPath = absolutePath;
    }
  }

  async function loadFiles(dir: string) {
    loading = true;
    try {
      files = await discoverMarkdownFiles(dir);
      const priority = files.find(f => f.priority);
      selectedPath = priority?.path ?? files[0]?.path ?? null;
    } catch (e) {
      console.warn('Failed to discover markdown files:', e);
      files = [];
    } finally {
      loading = false;
    }
  }
</script>

<div class="project-files">
  <aside class="file-picker">
    {#if loading}
      <div class="state-msg">Scanning...</div>
    {:else if files.length === 0}
      <div class="state-msg">No files found</div>
    {:else}
      <ul class="file-list">
        {#each files as file}
          <li>
            <button
              class="file-btn"
              class:active={selectedPath === file.path}
              class:priority={file.priority}
              onclick={() => (selectedPath = file.path)}
            >
              {file.name}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <main class="doc-content">
    {#if selectedPath}
      <MarkdownPane paneId="pf-{projectName}" filePath={selectedPath} onNavigate={handleNavigate} />
    {:else}
      <div class="state-msg full">Select a file</div>
    {/if}
  </main>
</div>

<style>
  .project-files {
    display: flex;
    height: 100%;
    overflow: hidden;
    flex: 1;
  }

  .file-picker {
    width: 10rem;
    flex-shrink: 0;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    overflow-y: auto;
    padding: 0.25rem 0;
  }

  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .file-btn {
    display: block;
    width: 100%;
    padding: 0.2rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-btn:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .file-btn.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .file-btn.priority {
    color: var(--ctp-blue);
  }

  .doc-content {
    flex: 1;
    overflow: auto;
    min-width: 0;
  }

  .state-msg {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    padding: 0.75rem 0.5rem;
    text-align: center;
  }

  .state-msg.full {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
</style>
