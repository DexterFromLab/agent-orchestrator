// Theme system — Catppuccin flavors + popular editor themes
// All themes map to the same --ctp-* CSS custom property slots.

/** All available theme identifiers */
export type ThemeId =
  | 'mocha' | 'macchiato' | 'frappe' | 'latte'
  | 'vscode-dark' | 'atom-one-dark' | 'monokai' | 'dracula'
  | 'nord' | 'solarized-dark' | 'github-dark';

/** Keep for backwards compat — subset of ThemeId */
export type CatppuccinFlavor = 'latte' | 'frappe' | 'macchiato' | 'mocha';

export interface ThemePalette {
  rosewater: string;
  flamingo: string;
  pink: string;
  mauve: string;
  red: string;
  maroon: string;
  peach: string;
  yellow: string;
  green: string;
  teal: string;
  sky: string;
  sapphire: string;
  blue: string;
  lavender: string;
  text: string;
  subtext1: string;
  subtext0: string;
  overlay2: string;
  overlay1: string;
  overlay0: string;
  surface2: string;
  surface1: string;
  surface0: string;
  base: string;
  mantle: string;
  crust: string;
}

/** Keep old name as alias */
export type CatppuccinPalette = ThemePalette;

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  group: string; // For grouping in <optgroup>
  isDark: boolean;
}

export const THEME_LIST: ThemeMeta[] = [
  { id: 'mocha',          label: 'Catppuccin Mocha',    group: 'Catppuccin', isDark: true },
  { id: 'macchiato',      label: 'Catppuccin Macchiato',group: 'Catppuccin', isDark: true },
  { id: 'frappe',         label: 'Catppuccin Frappé',   group: 'Catppuccin', isDark: true },
  { id: 'latte',          label: 'Catppuccin Latte',    group: 'Catppuccin', isDark: false },
  { id: 'vscode-dark',    label: 'VSCode Dark+',        group: 'Editor',     isDark: true },
  { id: 'atom-one-dark',  label: 'Atom One Dark',       group: 'Editor',     isDark: true },
  { id: 'monokai',        label: 'Monokai',             group: 'Editor',     isDark: true },
  { id: 'dracula',        label: 'Dracula',             group: 'Editor',     isDark: true },
  { id: 'nord',           label: 'Nord',                group: 'Editor',     isDark: true },
  { id: 'solarized-dark', label: 'Solarized Dark',      group: 'Editor',     isDark: true },
  { id: 'github-dark',    label: 'GitHub Dark',         group: 'Editor',     isDark: true },
];

const palettes: Record<ThemeId, ThemePalette> = {
  // --- Catppuccin ---
  latte: {
    rosewater: '#dc8a78', flamingo: '#dd7878', pink: '#ea76cb', mauve: '#8839ef',
    red: '#d20f39', maroon: '#e64553', peach: '#fe640b', yellow: '#df8e1d',
    green: '#40a02b', teal: '#179299', sky: '#04a5e5', sapphire: '#209fb5',
    blue: '#1e66f5', lavender: '#7287fd',
    text: '#4c4f69', subtext1: '#5c5f77', subtext0: '#6c6f85',
    overlay2: '#7c7f93', overlay1: '#8c8fa1', overlay0: '#9ca0b0',
    surface2: '#acb0be', surface1: '#bcc0cc', surface0: '#ccd0da',
    base: '#eff1f5', mantle: '#e6e9ef', crust: '#dce0e8',
  },
  frappe: {
    rosewater: '#f2d5cf', flamingo: '#eebebe', pink: '#f4b8e4', mauve: '#ca9ee6',
    red: '#e78284', maroon: '#ea999c', peach: '#ef9f76', yellow: '#e5c890',
    green: '#a6d189', teal: '#81c8be', sky: '#99d1db', sapphire: '#85c1dc',
    blue: '#8caaee', lavender: '#babbf1',
    text: '#c6d0f5', subtext1: '#b5bfe2', subtext0: '#a5adce',
    overlay2: '#949cbb', overlay1: '#838ba7', overlay0: '#737994',
    surface2: '#626880', surface1: '#51576d', surface0: '#414559',
    base: '#303446', mantle: '#292c3c', crust: '#232634',
  },
  macchiato: {
    rosewater: '#f4dbd6', flamingo: '#f0c6c6', pink: '#f5bde6', mauve: '#c6a0f6',
    red: '#ed8796', maroon: '#ee99a0', peach: '#f5a97f', yellow: '#eed49f',
    green: '#a6da95', teal: '#8bd5ca', sky: '#91d7e3', sapphire: '#7dc4e4',
    blue: '#8aadf4', lavender: '#b7bdf8',
    text: '#cad3f5', subtext1: '#b8c0e0', subtext0: '#a5adcb',
    overlay2: '#939ab7', overlay1: '#8087a2', overlay0: '#6e738d',
    surface2: '#5b6078', surface1: '#494d64', surface0: '#363a4f',
    base: '#24273a', mantle: '#1e2030', crust: '#181926',
  },
  mocha: {
    rosewater: '#f5e0dc', flamingo: '#f2cdcd', pink: '#f5c2e7', mauve: '#cba6f7',
    red: '#f38ba8', maroon: '#eba0ac', peach: '#fab387', yellow: '#f9e2af',
    green: '#a6e3a1', teal: '#94e2d5', sky: '#89dceb', sapphire: '#74c7ec',
    blue: '#89b4fa', lavender: '#b4befe',
    text: '#cdd6f4', subtext1: '#bac2de', subtext0: '#a6adc8',
    overlay2: '#9399b2', overlay1: '#7f849c', overlay0: '#6c7086',
    surface2: '#585b70', surface1: '#45475a', surface0: '#313244',
    base: '#1e1e2e', mantle: '#181825', crust: '#11111b',
  },

  // --- VSCode Dark+ ---
  'vscode-dark': {
    rosewater: '#d4a0a0', flamingo: '#cf8686', pink: '#c586c0', mauve: '#c586c0',
    red: '#f44747', maroon: '#d16969', peach: '#ce9178', yellow: '#dcdcaa',
    green: '#6a9955', teal: '#4ec9b0', sky: '#9cdcfe', sapphire: '#4fc1ff',
    blue: '#569cd6', lavender: '#b4b4f7',
    text: '#d4d4d4', subtext1: '#cccccc', subtext0: '#b0b0b0',
    overlay2: '#858585', overlay1: '#6e6e6e', overlay0: '#5a5a5a',
    surface2: '#3e3e42', surface1: '#333338', surface0: '#2d2d30',
    base: '#1e1e1e', mantle: '#181818', crust: '#111111',
  },

  // --- Atom One Dark ---
  'atom-one-dark': {
    rosewater: '#e5c07b', flamingo: '#e06c75', pink: '#c678dd', mauve: '#c678dd',
    red: '#e06c75', maroon: '#be5046', peach: '#d19a66', yellow: '#e5c07b',
    green: '#98c379', teal: '#56b6c2', sky: '#56b6c2', sapphire: '#61afef',
    blue: '#61afef', lavender: '#c8ccd4',
    text: '#abb2bf', subtext1: '#9da5b4', subtext0: '#8b92a0',
    overlay2: '#7f848e', overlay1: '#636d83', overlay0: '#545862',
    surface2: '#474b56', surface1: '#3b3f4c', surface0: '#333842',
    base: '#282c34', mantle: '#21252b', crust: '#181a1f',
  },

  // --- Monokai ---
  monokai: {
    rosewater: '#f8f8f2', flamingo: '#f92672', pink: '#f92672', mauve: '#ae81ff',
    red: '#f92672', maroon: '#f92672', peach: '#fd971f', yellow: '#e6db74',
    green: '#a6e22e', teal: '#66d9ef', sky: '#66d9ef', sapphire: '#66d9ef',
    blue: '#66d9ef', lavender: '#ae81ff',
    text: '#f8f8f2', subtext1: '#e8e8e2', subtext0: '#cfcfc2',
    overlay2: '#a8a8a2', overlay1: '#90908a', overlay0: '#75715e',
    surface2: '#595950', surface1: '#49483e', surface0: '#3e3d32',
    base: '#272822', mantle: '#1e1f1c', crust: '#141411',
  },

  // --- Dracula ---
  dracula: {
    rosewater: '#f1c4e0', flamingo: '#ff79c6', pink: '#ff79c6', mauve: '#bd93f9',
    red: '#ff5555', maroon: '#ff6e6e', peach: '#ffb86c', yellow: '#f1fa8c',
    green: '#50fa7b', teal: '#8be9fd', sky: '#8be9fd', sapphire: '#8be9fd',
    blue: '#6272a4', lavender: '#bd93f9',
    text: '#f8f8f2', subtext1: '#e8e8e2', subtext0: '#c0c0ba',
    overlay2: '#a0a0a0', overlay1: '#7f7f7f', overlay0: '#6272a4',
    surface2: '#555969', surface1: '#44475a', surface0: '#383a4a',
    base: '#282a36', mantle: '#21222c', crust: '#191a21',
  },

  // --- Nord ---
  nord: {
    rosewater: '#d08770', flamingo: '#bf616a', pink: '#b48ead', mauve: '#b48ead',
    red: '#bf616a', maroon: '#bf616a', peach: '#d08770', yellow: '#ebcb8b',
    green: '#a3be8c', teal: '#8fbcbb', sky: '#88c0d0', sapphire: '#81a1c1',
    blue: '#5e81ac', lavender: '#b48ead',
    text: '#eceff4', subtext1: '#e5e9f0', subtext0: '#d8dee9',
    overlay2: '#a5adba', overlay1: '#8891a0', overlay0: '#6c7588',
    surface2: '#4c566a', surface1: '#434c5e', surface0: '#3b4252',
    base: '#2e3440', mantle: '#272c36', crust: '#20242c',
  },

  // --- Solarized Dark ---
  'solarized-dark': {
    rosewater: '#d33682', flamingo: '#dc322f', pink: '#d33682', mauve: '#6c71c4',
    red: '#dc322f', maroon: '#cb4b16', peach: '#cb4b16', yellow: '#b58900',
    green: '#859900', teal: '#2aa198', sky: '#2aa198', sapphire: '#268bd2',
    blue: '#268bd2', lavender: '#6c71c4',
    text: '#839496', subtext1: '#93a1a1', subtext0: '#778a8b',
    overlay2: '#657b83', overlay1: '#586e75', overlay0: '#4a6068',
    surface2: '#1c4753', surface1: '#143845', surface0: '#073642',
    base: '#002b36', mantle: '#00222b', crust: '#001a21',
  },

  // --- GitHub Dark ---
  'github-dark': {
    rosewater: '#ffa198', flamingo: '#ff7b72', pink: '#f778ba', mauve: '#d2a8ff',
    red: '#ff7b72', maroon: '#ffa198', peach: '#ffa657', yellow: '#e3b341',
    green: '#7ee787', teal: '#56d4dd', sky: '#79c0ff', sapphire: '#79c0ff',
    blue: '#58a6ff', lavender: '#d2a8ff',
    text: '#c9d1d9', subtext1: '#b1bac4', subtext0: '#8b949e',
    overlay2: '#6e7681', overlay1: '#565c64', overlay0: '#484f58',
    surface2: '#373e47', surface1: '#30363d', surface0: '#21262d',
    base: '#0d1117', mantle: '#090c10', crust: '#050608',
  },
};

export function getPalette(theme: ThemeId): ThemePalette {
  return palettes[theme];
}

/** Build xterm.js ITheme from a palette */
export function buildXtermTheme(theme: ThemeId): XtermTheme {
  const p = palettes[theme];
  return {
    background: p.base,
    foreground: p.text,
    cursor: p.rosewater,
    cursorAccent: p.base,
    selectionBackground: p.surface1,
    selectionForeground: p.text,
    black: p.surface1,
    red: p.red,
    green: p.green,
    yellow: p.yellow,
    blue: p.blue,
    magenta: p.pink,
    cyan: p.teal,
    white: p.subtext1,
    brightBlack: p.surface2,
    brightRed: p.red,
    brightGreen: p.green,
    brightYellow: p.yellow,
    brightBlue: p.blue,
    brightMagenta: p.pink,
    brightCyan: p.teal,
    brightWhite: p.subtext0,
  };
}

/** CSS custom property names mapped to palette keys */
const CSS_VAR_MAP: [string, keyof ThemePalette][] = [
  ['--ctp-rosewater', 'rosewater'],
  ['--ctp-flamingo', 'flamingo'],
  ['--ctp-pink', 'pink'],
  ['--ctp-mauve', 'mauve'],
  ['--ctp-red', 'red'],
  ['--ctp-maroon', 'maroon'],
  ['--ctp-peach', 'peach'],
  ['--ctp-yellow', 'yellow'],
  ['--ctp-green', 'green'],
  ['--ctp-teal', 'teal'],
  ['--ctp-sky', 'sky'],
  ['--ctp-sapphire', 'sapphire'],
  ['--ctp-blue', 'blue'],
  ['--ctp-lavender', 'lavender'],
  ['--ctp-text', 'text'],
  ['--ctp-subtext1', 'subtext1'],
  ['--ctp-subtext0', 'subtext0'],
  ['--ctp-overlay2', 'overlay2'],
  ['--ctp-overlay1', 'overlay1'],
  ['--ctp-overlay0', 'overlay0'],
  ['--ctp-surface2', 'surface2'],
  ['--ctp-surface1', 'surface1'],
  ['--ctp-surface0', 'surface0'],
  ['--ctp-base', 'base'],
  ['--ctp-mantle', 'mantle'],
  ['--ctp-crust', 'crust'],
];

/** Apply a theme's CSS custom properties to document root */
export function applyCssVariables(theme: ThemeId): void {
  const p = palettes[theme];
  const style = document.documentElement.style;
  for (const [varName, key] of CSS_VAR_MAP) {
    style.setProperty(varName, p[key]);
  }
}

/** @deprecated Use THEME_LIST instead */
export const FLAVOR_LABELS: Record<CatppuccinFlavor, string> = {
  latte: 'Latte (Light)',
  frappe: 'Frappe',
  macchiato: 'Macchiato',
  mocha: 'Mocha (Default)',
};

/** @deprecated Use THEME_LIST instead */
export const ALL_FLAVORS: CatppuccinFlavor[] = ['latte', 'frappe', 'macchiato', 'mocha'];

/** All valid theme IDs for validation */
export const ALL_THEME_IDS: ThemeId[] = THEME_LIST.map(t => t.id);
