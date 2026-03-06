// Theme store — persists Catppuccin flavor selection via settings bridge

import { getSetting, setSetting } from '../adapters/settings-bridge';
import {
  type CatppuccinFlavor,
  buildXtermTheme,
  applyCssVariables,
  type XtermTheme,
} from '../styles/themes';

let currentFlavor = $state<CatppuccinFlavor>('mocha');

export function getCurrentFlavor(): CatppuccinFlavor {
  return currentFlavor;
}

export function getXtermTheme(): XtermTheme {
  return buildXtermTheme(currentFlavor);
}

/** Change flavor, apply CSS variables, and persist to settings DB */
export async function setFlavor(flavor: CatppuccinFlavor): Promise<void> {
  currentFlavor = flavor;
  applyCssVariables(flavor);
  try {
    await setSetting('theme', flavor);
  } catch (e) {
    console.error('Failed to persist theme setting:', e);
  }
}

/** Load saved flavor from settings DB and apply. Call once on app startup. */
export async function initTheme(): Promise<void> {
  try {
    const saved = await getSetting('theme');
    if (saved && ['latte', 'frappe', 'macchiato', 'mocha'].includes(saved)) {
      currentFlavor = saved as CatppuccinFlavor;
    }
  } catch {
    // Fall back to default (mocha) — catppuccin.css provides Mocha defaults
  }
  // Always apply to sync CSS vars with current flavor
  // (skip if mocha — catppuccin.css already has Mocha values)
  if (currentFlavor !== 'mocha') {
    applyCssVariables(currentFlavor);
  }
}
