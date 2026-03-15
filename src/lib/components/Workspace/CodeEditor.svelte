<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, dropCursor } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
  import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

  interface Props {
    content: string;
    lang: string;
    onchange?: (content: string) => void;
    onsave?: () => void;
    onblur?: () => void;
  }

  let { content, lang, onchange, onsave, onblur }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined = $state();

  // Map lang hint to CodeMirror language extension
  async function getLangExtension(lang: string) {
    switch (lang) {
      case 'javascript':
      case 'jsx': {
        const { javascript } = await import('@codemirror/lang-javascript');
        return javascript({ jsx: true });
      }
      case 'typescript':
      case 'tsx': {
        const { javascript } = await import('@codemirror/lang-javascript');
        return javascript({ jsx: true, typescript: true });
      }
      case 'html':
      case 'svelte': {
        const { html } = await import('@codemirror/lang-html');
        return html();
      }
      case 'css':
      case 'scss':
      case 'less': {
        const { css } = await import('@codemirror/lang-css');
        return css();
      }
      case 'json': {
        const { json } = await import('@codemirror/lang-json');
        return json();
      }
      case 'markdown': {
        const { markdown } = await import('@codemirror/lang-markdown');
        return markdown();
      }
      case 'python': {
        const { python } = await import('@codemirror/lang-python');
        return python();
      }
      case 'rust': {
        const { rust } = await import('@codemirror/lang-rust');
        return rust();
      }
      case 'xml': {
        const { xml } = await import('@codemirror/lang-xml');
        return xml();
      }
      case 'sql': {
        const { sql } = await import('@codemirror/lang-sql');
        return sql();
      }
      case 'yaml': {
        const { yaml } = await import('@codemirror/lang-yaml');
        return yaml();
      }
      case 'cpp':
      case 'c':
      case 'h': {
        const { cpp } = await import('@codemirror/lang-cpp');
        return cpp();
      }
      case 'java': {
        const { java } = await import('@codemirror/lang-java');
        return java();
      }
      case 'php': {
        const { php } = await import('@codemirror/lang-php');
        return php();
      }
      case 'go': {
        const { go } = await import('@codemirror/lang-go');
        return go();
      }
      default:
        return null;
    }
  }

  // Catppuccin Mocha-inspired theme that reads CSS custom properties
  const catppuccinTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--ctp-base)',
      color: 'var(--ctp-text)',
      fontFamily: 'var(--term-font-family, "JetBrains Mono", monospace)',
      fontSize: '0.775rem',
    },
    '.cm-content': {
      caretColor: 'var(--ctp-rosewater)',
      lineHeight: '1.55',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--ctp-rosewater)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-blue) 25%, transparent)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--ctp-mantle)',
      color: 'var(--ctp-text)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--ctp-surface0)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-yellow) 25%, transparent)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-peach) 30%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-surface0) 40%, transparent)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-teal) 15%, transparent)',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-blue) 20%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--ctp-blue) 40%, transparent)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--ctp-mantle)',
      color: 'var(--ctp-overlay0)',
      border: 'none',
      borderRight: '1px solid var(--ctp-surface0)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--ctp-surface0) 40%, transparent)',
      color: 'var(--ctp-text)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--ctp-surface0)',
      border: 'none',
      color: 'var(--ctp-overlay1)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--ctp-surface0)',
      color: 'var(--ctp-text)',
      border: '1px solid var(--ctp-surface1)',
      borderRadius: '0.25rem',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'var(--ctp-surface1)',
      borderBottomColor: 'var(--ctp-surface1)',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: 'var(--ctp-surface0)',
      borderBottomColor: 'var(--ctp-surface0)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'color-mix(in srgb, var(--ctp-blue) 20%, transparent)',
        color: 'var(--ctp-text)',
      },
    },
  }, { dark: true });

  async function createEditor() {
    if (!container) return;

    const langExt = await getLangExtension(lang);

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
        { key: 'Mod-s', run: () => { onsave?.(); return true; } },
      ]),
      catppuccinTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onchange?.(update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        blur: () => { onblur?.(); },
      }),
      EditorView.lineWrapping,
    ];

    if (langExt) extensions.push(langExt);

    view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: container,
    });
  }

  onMount(() => {
    createEditor();
  });

  onDestroy(() => {
    view?.destroy();
  });

  // When content prop changes externally (different file loaded), replace editor content
  let lastContent = $state(content);
  $effect(() => {
    const c = content;
    if (view && c !== lastContent) {
      const currentDoc = view.state.doc.toString();
      if (c !== currentDoc) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: c },
        });
      }
      lastContent = c;
    }
  });

  // When lang changes, recreate editor
  let lastLang = $state(lang);
  $effect(() => {
    const l = lang;
    if (l !== lastLang && view) {
      lastLang = l;
      const currentContent = view.state.doc.toString();
      view.destroy();
      // Small delay to let DOM settle
      queueMicrotask(async () => {
        const langExt = await getLangExtension(l);
        const extensions = [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
            { key: 'Mod-s', run: () => { onsave?.(); return true; } },
          ]),
          catppuccinTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              onchange?.(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: () => { onblur?.(); },
          }),
          EditorView.lineWrapping,
        ];
        if (langExt) extensions.push(langExt);
        view = new EditorView({
          state: EditorState.create({ doc: currentContent, extensions }),
          parent: container!,
        });
      });
    }
  });

  export function getContent(): string {
    return view?.state.doc.toString() ?? content;
  }
</script>

<div class="code-editor" bind:this={container}></div>

<style>
  .code-editor {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .code-editor :global(.cm-editor) {
    flex: 1;
    overflow: hidden;
  }

  .code-editor :global(.cm-scroller) {
    overflow: auto;
  }
</style>
