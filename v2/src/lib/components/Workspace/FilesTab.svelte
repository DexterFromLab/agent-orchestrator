<script lang="ts">
  import { listDirectoryChildren, readFileContent, type DirEntry, type FileContent } from '../../adapters/files-bridge';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';
  import { convertFileSrc } from '@tauri-apps/api/core';

  interface Props {
    cwd: string;
  }

  let { cwd }: Props = $props();

  // Tree state: expanded dirs and their children
  interface TreeNode extends DirEntry {
    children?: TreeNode[];
    loading?: boolean;
    depth: number;
  }

  let roots = $state<TreeNode[]>([]);
  let expandedPaths = $state<Set<string>>(new Set());
  let selectedPath = $state<string | null>(null);
  let fileContent = $state<FileContent | null>(null);
  let fileLoading = $state(false);
  let highlighterReady = $state(false);

  // Load root directory
  $effect(() => {
    const dir = cwd;
    loadDirectory(dir).then(entries => {
      roots = entries.map(e => ({ ...e, depth: 0 }));
    });
    getHighlighter().then(() => { highlighterReady = true; });
  });

  async function loadDirectory(path: string): Promise<DirEntry[]> {
    try {
      return await listDirectoryChildren(path);
    } catch (e) {
      console.warn('Failed to list directory:', e);
      return [];
    }
  }

  async function toggleDir(node: TreeNode) {
    const path = node.path;
    if (expandedPaths.has(path)) {
      const next = new Set(expandedPaths);
      next.delete(path);
      expandedPaths = next;
    } else {
      // Load children if not yet loaded
      if (!node.children) {
        node.loading = true;
        const entries = await loadDirectory(path);
        node.children = entries.map(e => ({ ...e, depth: node.depth + 1 }));
        node.loading = false;
      }
      expandedPaths = new Set([...expandedPaths, path]);
    }
  }

  async function selectFile(node: TreeNode) {
    if (node.is_dir) {
      toggleDir(node);
      return;
    }
    selectedPath = node.path;
    fileLoading = true;
    try {
      fileContent = await readFileContent(node.path);
    } catch (e) {
      fileContent = { type: 'Binary', message: `Error: ${e}` };
    } finally {
      fileLoading = false;
    }
  }

  function flattenTree(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.is_dir && expandedPaths.has(node.path) && node.children) {
        result.push(...flattenTree(node.children));
      }
    }
    return result;
  }

  let flatNodes = $derived(flattenTree(roots));

  function fileIcon(node: TreeNode): string {
    if (node.is_dir) return expandedPaths.has(node.path) ? '📂' : '📁';
    const ext = node.ext;
    if (['ts', 'tsx'].includes(ext)) return '🟦';
    if (['js', 'jsx', 'mjs'].includes(ext)) return '🟨';
    if (ext === 'rs') return '🦀';
    if (ext === 'py') return '🐍';
    if (ext === 'svelte') return '🟧';
    if (['md', 'markdown'].includes(ext)) return '📝';
    if (['json', 'toml', 'yaml', 'yml'].includes(ext)) return '⚙️';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    if (['css', 'scss', 'less'].includes(ext)) return '🎨';
    if (['html', 'htm'].includes(ext)) return '🌐';
    return '📄';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderHighlighted(content: string, lang: string): string {
    if (!highlighterReady || lang === 'text' || lang === 'csv') {
      return `<pre><code>${escapeHtml(content)}</code></pre>`;
    }
    const highlighted = highlightCode(content, lang);
    if (highlighted !== escapeHtml(content)) return highlighted;
    return `<pre><code>${escapeHtml(content)}</code></pre>`;
  }

  function isImageExt(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext);
  }
</script>

<div class="files-tab">
  <aside class="tree-sidebar">
    <div class="tree-header">
      <span class="tree-title">Explorer</span>
    </div>
    <div class="tree-list">
      {#each flatNodes as node (node.path)}
        <button
          class="tree-row"
          class:selected={selectedPath === node.path}
          class:dir={node.is_dir}
          style="padding-left: {0.5 + node.depth * 1}rem"
          onclick={() => selectFile(node)}
        >
          <span class="tree-icon">{fileIcon(node)}</span>
          <span class="tree-name">{node.name}</span>
          {#if !node.is_dir}
            <span class="tree-size">{formatSize(node.size)}</span>
          {/if}
          {#if node.loading}
            <span class="tree-loading">…</span>
          {/if}
        </button>
      {/each}
      {#if flatNodes.length === 0}
        <div class="tree-empty">No files</div>
      {/if}
    </div>
  </aside>

  <main class="file-viewer">
    {#if fileLoading}
      <div class="viewer-state">Loading…</div>
    {:else if !selectedPath}
      <div class="viewer-state">Select a file to view</div>
    {:else if fileContent?.type === 'TooLarge'}
      <div class="viewer-state">
        <span class="viewer-warning">File too large</span>
        <span class="viewer-detail">{formatSize(fileContent.size)}</span>
      </div>
    {:else if fileContent?.type === 'Binary'}
      {#if isImageExt(selectedPath)}
        <div class="viewer-image">
          <img src={convertFileSrc(selectedPath)} alt={selectedPath.split('/').pop()} />
        </div>
      {:else}
        <div class="viewer-state">{fileContent.message}</div>
      {/if}
    {:else if fileContent?.type === 'Text'}
      <div class="viewer-code">
        {#if fileContent.lang === 'csv'}
          <pre class="csv-content"><code>{fileContent.content}</code></pre>
        {:else}
          {@html renderHighlighted(fileContent.content, fileContent.lang)}
        {/if}
      </div>
    {/if}
    {#if selectedPath}
      <div class="viewer-path">{selectedPath}</div>
    {/if}
  </main>
</div>

<style>
  .files-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
    flex: 1;
  }

  .tree-sidebar {
    width: 14rem;
    flex-shrink: 0;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tree-header {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .tree-title {
    font-size: 0.675rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-overlay1);
  }

  .tree-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s;
    padding-right: 0.375rem;
  }

  .tree-row:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .tree-row.selected {
    background: color-mix(in srgb, var(--accent, var(--ctp-blue)) 15%, transparent);
    color: var(--ctp-text);
  }

  .tree-row.dir {
    font-weight: 500;
  }

  .tree-icon {
    font-size: 0.65rem;
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
  }

  .tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .tree-size {
    font-size: 0.575rem;
    color: var(--ctp-overlay0);
    flex-shrink: 0;
    margin-left: auto;
  }

  .tree-loading {
    color: var(--ctp-overlay0);
    font-size: 0.6rem;
  }

  .tree-empty {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    padding: 1rem;
    text-align: center;
  }

  .file-viewer {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ctp-base);
  }

  .viewer-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
  }

  .viewer-warning {
    color: var(--ctp-yellow);
    font-weight: 600;
  }

  .viewer-detail {
    font-size: 0.7rem;
  }

  .viewer-code {
    flex: 1;
    overflow: auto;
    padding: 0.75rem 1rem;
  }

  .viewer-code :global(pre) {
    margin: 0;
    font-family: var(--term-font-family, 'JetBrains Mono', monospace);
    font-size: 0.775rem;
    line-height: 1.55;
    color: var(--ctp-text);
  }

  .viewer-code :global(code) {
    font-family: inherit;
    background: none;
    padding: 0;
  }

  .viewer-code :global(.shiki) {
    background: transparent !important;
    padding: 0;
    margin: 0;
    border: none;
    box-shadow: none;
  }

  .csv-content {
    font-family: var(--term-font-family, monospace);
    font-size: 0.75rem;
    white-space: pre;
    tab-size: 4;
  }

  .viewer-image {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    overflow: auto;
  }

  .viewer-image img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.25rem;
  }

  .viewer-path {
    border-top: 1px solid var(--ctp-surface0);
    padding: 0.25rem 0.75rem;
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay0);
    flex-shrink: 0;
  }
</style>
