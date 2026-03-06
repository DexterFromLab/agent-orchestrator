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

  onMount(async () => {
    try {
      await getHighlighter();
      const content = await watchFile(paneId, filePath);
      renderMarkdown(content);

      unlisten = await onFileChanged((payload: FileChangedPayload) => {
        if (payload.pane_id === paneId) {
          renderMarkdown(payload.content);
        }
      });
    } catch (e) {
      error = `Failed to open file: ${e}`;
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
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .markdown-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    font-size: 14px;
    line-height: 1.6;
  }

  .markdown-body :global(h1) {
    font-size: 1.6em;
    font-weight: 700;
    margin: 0.8em 0 0.4em;
    color: var(--ctp-lavender);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
  }

  .markdown-body :global(h2) {
    font-size: 1.3em;
    font-weight: 600;
    margin: 0.7em 0 0.3em;
    color: var(--ctp-blue);
  }

  .markdown-body :global(h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.6em 0 0.3em;
    color: var(--ctp-sapphire);
  }

  .markdown-body :global(p) {
    margin: 0.5em 0;
  }

  .markdown-body :global(code) {
    background: var(--bg-surface);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--ctp-green);
  }

  .markdown-body :global(pre) {
    background: var(--bg-surface);
    padding: 12px 14px;
    border-radius: var(--border-radius);
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
    margin: 0.6em 0;
  }

  .markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--text-primary);
  }

  .markdown-body :global(.shiki) {
    background: var(--bg-surface) !important;
    padding: 12px 14px;
    border-radius: var(--border-radius);
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
    margin: 0.6em 0;
  }

  .markdown-body :global(.shiki code) {
    background: none !important;
    padding: 0;
  }

  .markdown-body :global(blockquote) {
    border-left: 3px solid var(--ctp-mauve);
    margin: 0.5em 0;
    padding: 4px 12px;
    color: var(--text-secondary);
  }

  .markdown-body :global(ul), .markdown-body :global(ol) {
    padding-left: 24px;
    margin: 0.4em 0;
  }

  .markdown-body :global(li) {
    margin: 0.2em 0;
  }

  .markdown-body :global(a) {
    color: var(--ctp-blue);
    text-decoration: none;
  }

  .markdown-body :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
    font-size: 13px;
  }

  .markdown-body :global(th), .markdown-body :global(td) {
    border: 1px solid var(--border);
    padding: 6px 10px;
    text-align: left;
  }

  .markdown-body :global(th) {
    background: var(--bg-surface);
    font-weight: 600;
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }

  .markdown-body :global(img) {
    max-width: 100%;
    border-radius: var(--border-radius);
  }

  .file-path {
    border-top: 1px solid var(--border);
    padding: 4px 12px;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .error {
    color: var(--ctp-red);
    padding: 16px;
    font-size: 13px;
  }
</style>
