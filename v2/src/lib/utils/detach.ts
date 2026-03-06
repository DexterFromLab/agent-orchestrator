// Detachable pane support — opens panes in separate OS windows
// Uses Tauri's WebviewWindow API

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { Pane } from '../stores/layout.svelte';

let detachCounter = 0;

export async function detachPane(pane: Pane): Promise<void> {
  detachCounter++;
  const label = `detached-${detachCounter}`;

  const params = new URLSearchParams({
    detached: 'true',
    type: pane.type,
    title: pane.title,
  });

  if (pane.shell) params.set('shell', pane.shell);
  if (pane.cwd) params.set('cwd', pane.cwd);
  if (pane.args) params.set('args', JSON.stringify(pane.args));
  if (pane.type === 'agent') params.set('sessionId', pane.id);

  const webview = new WebviewWindow(label, {
    url: `index.html?${params.toString()}`,
    title: `BTerminal — ${pane.title}`,
    width: 800,
    height: 600,
    decorations: true,
    resizable: true,
  });

  // Wait for the window to be created
  await webview.once('tauri://created', () => {
    // Window created successfully
  });

  await webview.once('tauri://error', (e) => {
    console.error('Failed to create detached window:', e);
  });
}

export function isDetachedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('detached') === 'true';
}

export function getDetachedConfig(): {
  type: string;
  title: string;
  shell?: string;
  cwd?: string;
  args?: string[];
  sessionId?: string;
} | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('detached') !== 'true') return null;

  const argsStr = params.get('args');
  return {
    type: params.get('type') ?? 'terminal',
    title: params.get('title') ?? 'Detached',
    shell: params.get('shell') ?? undefined,
    cwd: params.get('cwd') ?? undefined,
    args: argsStr ? JSON.parse(argsStr) : undefined,
    sessionId: params.get('sessionId') ?? undefined,
  };
}
