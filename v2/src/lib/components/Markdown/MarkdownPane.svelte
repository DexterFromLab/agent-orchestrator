<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked, Renderer } from 'marked';
  import { watchFile, unwatchFile, onFileChanged, type FileChangedPayload } from '../../adapters/file-bridge';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';

  interface Props {
    filePath: string;
    paneId: string;
    onExit?: () => void;
  }

  let { filePath, paneId, onExit }: Props = $props();

  let renderedHtml = $state('');
  let error = $state('');
  let unlisten: (() => void) | undefined;
  let currentWatchPath = $state<string | null>(null);
  let highlighterReady = $state(false);

  const renderer = new Renderer();
  renderer.code = function({ text, lang }: { text: string; lang?: string }) {
    if (lang) {
      const highlighted = highlightCode(text, lang);
      if (highlighted !== escapeHtml(text)) return highlighted;
    }
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
  };

  function renderMarkdown(source: string): void {
    try {
      renderedHtml = marked.parse(source, { renderer, async: false }) as string;
      error = '';
    } catch (e) {
      error = `Render error: ${e}`;
    }
  }

  // React to filePath changes — re-watch the new file
  $effect(() => {
    if (!highlighterReady) return;
    const path = filePath;
    if (path === currentWatchPath) return;

    // Unwatch previous file
    if (currentWatchPath) {
      unwatchFile(paneId).catch(() => {});
    }

    currentWatchPath = path;
    watchFile(paneId, path)
      .then(content => renderMarkdown(content))
      .catch(e => { error = `Failed to open file: ${e}`; });
  });

  onMount(async () => {
    try {
      await getHighlighter();
      highlighterReady = true;

      unlisten = await onFileChanged((payload: FileChangedPayload) => {
        if (payload.pane_id === paneId) {
          renderMarkdown(payload.content);
        }
      });
    } catch (e) {
      error = `Failed to initialize: ${e}`;
    }
  });

  onDestroy(() => {
    unlisten?.();
    unwatchFile(paneId).catch(() => {});
  });
</script>

<div class="markdown-pane">
  {#if error}
    <div class="error">{error}</div>
  {:else}
    <div class="markdown-body">
      {@html renderedHtml}
    </div>
  {/if}
  <div class="file-path">{filePath}</div>
</div>

<style>
  .markdown-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
  }

  .markdown-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.5rem;
    font-family: var(--ui-font-family, sans-serif);
    font-size: 0.875rem;
    line-height: 1.7;
  }

  .markdown-body :global(h1) {
    font-size: 1.6em;
    font-weight: 700;
    margin: 1em 0 0.5em;
    color: var(--ctp-lavender);
    border-bottom: 1px solid var(--ctp-surface1);
    padding-bottom: 0.3em;
  }

  .markdown-body :global(h2) {
    font-size: 1.3em;
    font-weight: 600;
    margin: 0.9em 0 0.4em;
    color: var(--ctp-blue);
  }

  .markdown-body :global(h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.8em 0 0.3em;
    color: var(--ctp-sapphire);
  }

  .markdown-body :global(h4) {
    font-size: 1em;
    font-weight: 600;
    margin: 0.6em 0 0.3em;
    color: var(--ctp-teal);
  }

  .markdown-body :global(p) {
    margin: 0.6em 0;
  }

  .markdown-body :global(strong) {
    color: var(--ctp-text);
    font-weight: 600;
  }

  .markdown-body :global(em) {
    color: var(--ctp-subtext1);
  }

  .markdown-body :global(code) {
    background: var(--ctp-surface0);
    padding: 0.125em 0.375em;
    border-radius: 0.25em;
    font-family: var(--term-font-family, 'JetBrains Mono', monospace);
    font-size: 0.85em;
    color: var(--ctp-green);
  }

  .markdown-body :global(pre) {
    background: var(--ctp-mantle);
    padding: 0.875rem 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.55;
    margin: 0.75em 0;
  }

  .markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--ctp-text);
    font-size: inherit;
  }

  .markdown-body :global(.shiki) {
    background: var(--ctp-mantle) !important;
    padding: 0.875rem 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.55;
    margin: 0.75em 0;
  }

  .markdown-body :global(.shiki code) {
    background: none !important;
    padding: 0;
  }

  .markdown-body :global(blockquote) {
    border-left: 3px solid var(--ctp-mauve);
    margin: 0.75em 0;
    padding: 0.375rem 1rem;
    color: var(--ctp-subtext0);
    background: color-mix(in srgb, var(--ctp-surface0) 30%, transparent);
    border-radius: 0 0.25rem 0.25rem 0;
  }

  .markdown-body :global(ul), .markdown-body :global(ol) {
    padding-left: 1.5rem;
    margin: 0.5em 0;
  }

  .markdown-body :global(li) {
    margin: 0.25em 0;
  }

  .markdown-body :global(li::marker) {
    color: var(--ctp-overlay1);
  }

  .markdown-body :global(a) {
    color: var(--ctp-blue);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.15s;
  }

  .markdown-body :global(a:hover) {
    border-bottom-color: var(--ctp-blue);
  }

  .markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
    font-size: 0.825rem;
  }

  .markdown-body :global(th), .markdown-body :global(td) {
    border: 1px solid var(--ctp-surface1);
    padding: 0.4rem 0.75rem;
    text-align: left;
  }

  .markdown-body :global(th) {
    background: var(--ctp-surface0);
    font-weight: 600;
    color: var(--ctp-subtext1);
  }

  .markdown-body :global(tr:hover td) {
    background: color-mix(in srgb, var(--ctp-surface0) 40%, transparent);
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid var(--ctp-surface1);
    margin: 1.5em 0;
  }

  .markdown-body :global(img) {
    max-width: 100%;
    border-radius: 0.375rem;
  }

  .file-path {
    border-top: 1px solid var(--ctp-surface0);
    padding: 0.25rem 0.75rem;
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay0);
    flex-shrink: 0;
  }

  .error {
    color: var(--ctp-red);
    padding: 1rem;
    font-size: 0.85rem;
  }
</style>
