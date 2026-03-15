import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;

// Use catppuccin-mocha theme (bundled with shiki)
const THEME = 'catppuccin-mocha';

// Common languages to preload
const LANGS = [
  'typescript', 'javascript', 'rust', 'python', 'bash',
  'json', 'html', 'css', 'svelte', 'sql', 'yaml', 'toml', 'markdown',
];

export async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (initPromise) return initPromise;

  initPromise = createHighlighter({
    themes: [THEME],
    langs: LANGS,
  });

  highlighter = await initPromise;
  return highlighter;
}

export function highlightCode(code: string, lang: string): string {
  if (!highlighter) return escapeHtml(code);

  try {
    const loadedLangs = highlighter.getLoadedLanguages();
    if (!loadedLangs.includes(lang as any)) {
      return escapeHtml(code);
    }

    return highlighter.codeToHtml(code, {
      lang,
      theme: THEME,
    });
  } catch {
    return escapeHtml(code);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
