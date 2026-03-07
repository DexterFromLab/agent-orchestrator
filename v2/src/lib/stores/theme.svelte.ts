// Theme store — persists theme selection via settings bridge

import { getSetting, setSetting } from '../adapters/settings-bridge';
import {
  type ThemeId,
  type CatppuccinFlavor,
  ALL_THEME_IDS,
  buildXtermTheme,
  applyCssVariables,
  type XtermTheme,
} from '../styles/themes';

let currentTheme = $state<ThemeId>('mocha');

/** Registered theme-change listeners */
const themeChangeCallbacks = new Set<() => void>();

/** Register a callback invoked after every theme change. Returns an unsubscribe function. */
export function onThemeChange(callback: () => void): () => void {
  themeChangeCallbacks.add(callback);
  return () => {
    themeChangeCallbacks.delete(callback);
  };
}

export function getCurrentTheme(): ThemeId {
  return currentTheme;
}

/** @deprecated Use getCurrentTheme() */
export function getCurrentFlavor(): CatppuccinFlavor {
  // Return valid CatppuccinFlavor or default to 'mocha'
  const catFlavors: string[] = ['latte', 'frappe', 'macchiato', 'mocha'];
  return catFlavors.includes(currentTheme) ? currentTheme as CatppuccinFlavor : 'mocha';
}

export function getXtermTheme(): XtermTheme {
  return buildXtermTheme(currentTheme);
}

/** Change theme, apply CSS variables, and persist to settings DB */
export async function setTheme(theme: ThemeId): Promise<void> {
  currentTheme = theme;
  applyCssVariables(theme);
  // Notify all listeners (e.g. open xterm.js terminals)
  for (const cb of themeChangeCallbacks) {
    try {
      cb();
    } catch (e) {
      console.error('Theme change callback error:', e);
    }
  }

  try {
    await setSetting('theme', theme);
  } catch (e) {
    console.error('Failed to persist theme setting:', e);
  }
}

/** @deprecated Use setTheme() */
export async function setFlavor(flavor: CatppuccinFlavor): Promise<void> {
  return setTheme(flavor);
}

/** Load saved theme from settings DB and apply. Call once on app startup. */
export async function initTheme(): Promise<void> {
  try {
    const saved = await getSetting('theme');
    if (saved && ALL_THEME_IDS.includes(saved as ThemeId)) {
      currentTheme = saved as ThemeId;
    }
  } catch {
    // Fall back to default (mocha) — catppuccin.css provides Mocha defaults
  }
  // Always apply to sync CSS vars with current theme
  // (skip if mocha — catppuccin.css already has Mocha values)
  if (currentTheme !== 'mocha') {
    applyCssVariables(currentTheme);
  }
}
