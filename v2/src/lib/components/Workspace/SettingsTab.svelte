<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getActiveProjectId,
    getActiveGroup,
    getActiveGroupId,
    getAllGroups,
    updateProject,
    addProject,
    removeProject,
    addGroup,
    removeGroup,
    switchGroup,
  } from '../../stores/workspace.svelte';
  import { deriveIdentifier } from '../../types/groups';
  import { getSetting, setSetting } from '../../adapters/settings-bridge';
  import { getCurrentTheme, setTheme } from '../../stores/theme.svelte';
  import { THEME_LIST, getPalette, type ThemeId } from '../../styles/themes';
  import { invoke } from '@tauri-apps/api/core';

  const PROJECT_ICONS = [
    '📁', '🚀', '🤖', '🌐', '🔧', '🎮', '📱', '💻',
    '🔬', '📊', '🎨', '🔒', '💬', '📦', '⚡', '🧪',
    '🏗️', '📝', '🎯', '💡', '🔥', '🛠️', '🧩', '🗄️',
  ];

  let activeGroupId = $derived(getActiveGroupId());
  let activeGroup = $derived(getActiveGroup());
  let activeProjectId = $derived(getActiveProjectId());
  let groups = $derived(getAllGroups());

  let editingProject = $derived(
    activeGroup?.projects.find(p => p.id === activeProjectId),
  );

  // Global settings
  let defaultShell = $state('');
  let defaultCwd = $state('');
  let uiFont = $state('');
  let uiFontSize = $state('');
  let termFont = $state('');
  let termFontSize = $state('');
  let selectedTheme = $state<ThemeId>(getCurrentTheme());

  // Dropdown open states
  let themeDropdownOpen = $state(false);
  let uiFontDropdownOpen = $state(false);
  let termFontDropdownOpen = $state(false);

  const UI_FONTS = [
    { value: '', label: 'System Default' },
    { value: 'Inter', label: 'Inter' },
    { value: 'IBM Plex Sans', label: 'IBM Plex Sans' },
    { value: 'Noto Sans', label: 'Noto Sans' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Source Sans 3', label: 'Source Sans 3' },
    { value: 'Ubuntu', label: 'Ubuntu' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
  ];

  const TERM_FONTS = [
    { value: '', label: 'Default (JetBrains Mono)' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'Cascadia Code', label: 'Cascadia Code' },
    { value: 'Source Code Pro', label: 'Source Code Pro' },
    { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
    { value: 'Hack', label: 'Hack' },
    { value: 'Inconsolata', label: 'Inconsolata' },
    { value: 'Ubuntu Mono', label: 'Ubuntu Mono' },
    { value: 'monospace', label: 'monospace' },
  ];

  // Group themes by category
  const themeGroups = $derived(() => {
    const map = new Map<string, typeof THEME_LIST>();
    for (const t of THEME_LIST) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return [...map.entries()];
  });

  let selectedThemeLabel = $derived(
    THEME_LIST.find(t => t.id === selectedTheme)?.label ?? selectedTheme,
  );

  let uiFontLabel = $derived(
    UI_FONTS.find(f => f.value === uiFont)?.label ?? 'System Default',
  );

  let termFontLabel = $derived(
    TERM_FONTS.find(f => f.value === termFont)?.label ?? 'Default (JetBrains Mono)',
  );

  onMount(async () => {
    const [shell, cwd, font, size, tfont, tsize] = await Promise.all([
      getSetting('default_shell'),
      getSetting('default_cwd'),
      getSetting('ui_font_family'),
      getSetting('ui_font_size'),
      getSetting('term_font_family'),
      getSetting('term_font_size'),
    ]);
    defaultShell = shell ?? '';
    defaultCwd = cwd ?? '';
    uiFont = font ?? '';
    uiFontSize = size ?? '';
    termFont = tfont ?? '';
    termFontSize = tsize ?? '';
    selectedTheme = getCurrentTheme();
  });

  function applyCssProp(prop: string, value: string) {
    document.documentElement.style.setProperty(prop, value);
  }

  async function saveGlobalSetting(key: string, value: string) {
    try {
      await setSetting(key, value);
    } catch (e) {
      console.error(`Failed to save setting ${key}:`, e);
    }
  }

  async function handleUiFontChange(family: string) {
    uiFont = family;
    uiFontDropdownOpen = false;
    const val = family
      ? `'${family}', sans-serif`
      : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";
    applyCssProp('--ui-font-family', val);
    await saveGlobalSetting('ui_font_family', family);
  }

  async function handleUiFontSizeChange(size: string) {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 8 || num > 24) return;
    uiFontSize = size;
    applyCssProp('--ui-font-size', `${num}px`);
    await saveGlobalSetting('ui_font_size', size);
  }

  async function handleTermFontChange(family: string) {
    termFont = family;
    termFontDropdownOpen = false;
    const val = family
      ? `'${family}', monospace`
      : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";
    applyCssProp('--term-font-family', val);
    await saveGlobalSetting('term_font_family', family);
  }

  async function handleTermFontSizeChange(size: string) {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 8 || num > 24) return;
    termFontSize = size;
    applyCssProp('--term-font-size', `${num}px`);
    await saveGlobalSetting('term_font_size', size);
  }

  async function handleThemeChange(themeId: ThemeId) {
    selectedTheme = themeId;
    themeDropdownOpen = false;
    await setTheme(themeId);
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
    }
  }

  async function browseDirectory(): Promise<string | null> {
    const selected = await invoke<string | null>('pick_directory');
    return selected ?? null;
  }

  // New project form
  let newName = $state('');
  let newCwd = $state('');

  function handleAddProject() {
    if (!newName.trim() || !newCwd.trim() || !activeGroupId) return;
    const id = crypto.randomUUID();
    addProject(activeGroupId, {
      id,
      name: newName.trim(),
      identifier: deriveIdentifier(newName.trim()),
      description: '',
      icon: '📁',
      cwd: newCwd.trim(),
      profile: 'default',
      enabled: true,
    });
    newName = '';
    newCwd = '';
  }

  // New group form
  let newGroupName = $state('');

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    const id = crypto.randomUUID();
    addGroup({ id, name: newGroupName.trim(), projects: [] });
    newGroupName = '';
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="settings-tab" onclick={handleClickOutside} onkeydown={handleKeydown}>
  <section class="settings-section">
    <h2>Appearance</h2>
    <div class="settings-list">
      <div class="setting-field">
        <span class="setting-label">Theme</span>
        <div class="custom-dropdown">
          <button
            class="dropdown-trigger"
            onclick={() => { themeDropdownOpen = !themeDropdownOpen; uiFontDropdownOpen = false; termFontDropdownOpen = false; }}
            aria-haspopup="listbox"
            aria-expanded={themeDropdownOpen}
          >
            <span
              class="theme-swatch"
              style="background: {getPalette(selectedTheme).base}; border-color: {getPalette(selectedTheme).surface1};"
            ></span>
            <span class="dropdown-label">{selectedThemeLabel}</span>
            <span class="dropdown-arrow">{themeDropdownOpen ? '\u25B4' : '\u25BE'}</span>
          </button>
          {#if themeDropdownOpen}
            <div class="dropdown-menu" role="listbox">
              {#each themeGroups() as [groupName, themes]}
                <div class="dropdown-group-label">{groupName}</div>
                {#each themes as t}
                  <button
                    class="dropdown-option"
                    class:active={t.id === selectedTheme}
                    role="option"
                    aria-selected={t.id === selectedTheme}
                    onclick={() => handleThemeChange(t.id)}
                  >
                    <span
                      class="theme-swatch"
                      style="background: {getPalette(t.id).base}; border-color: {getPalette(t.id).surface1};"
                    ></span>
                    <span class="dropdown-option-label">{t.label}</span>
                    <span class="theme-colors">
                      <span class="color-dot" style="background: {getPalette(t.id).red};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).green};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).blue};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).yellow};"></span>
                    </span>
                  </button>
                {/each}
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="setting-field">
        <span class="setting-label">UI Font</span>
        <div class="setting-row">
          <div class="custom-dropdown dropdown-grow">
            <button
              class="dropdown-trigger"
              onclick={() => { uiFontDropdownOpen = !uiFontDropdownOpen; themeDropdownOpen = false; termFontDropdownOpen = false; }}
              aria-haspopup="listbox"
              aria-expanded={uiFontDropdownOpen}
            >
              <span class="dropdown-label" style={uiFont ? `font-family: '${uiFont}', sans-serif` : ''}>{uiFontLabel}</span>
              <span class="dropdown-arrow">{uiFontDropdownOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {#if uiFontDropdownOpen}
              <div class="dropdown-menu" role="listbox">
                {#each UI_FONTS as f}
                  <button
                    class="dropdown-option"
                    class:active={f.value === uiFont}
                    role="option"
                    aria-selected={f.value === uiFont}
                    style={f.value ? `font-family: '${f.value}', sans-serif` : ''}
                    onclick={() => handleUiFontChange(f.value)}
                  >
                    <span class="dropdown-option-label">{f.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="size-control">
            <button
              class="size-btn"
              onclick={() => handleUiFontSizeChange(String((parseInt(uiFontSize, 10) || 13) - 1))}
              disabled={(parseInt(uiFontSize, 10) || 13) <= 8}
            >&minus;</button>
            <input
              type="number"
              min="8"
              max="24"
              value={uiFontSize || '13'}
              class="size-input"
              onchange={e => handleUiFontSizeChange((e.target as HTMLInputElement).value)}
            />
            <span class="size-unit">px</span>
            <button
              class="size-btn"
              onclick={() => handleUiFontSizeChange(String((parseInt(uiFontSize, 10) || 13) + 1))}
              disabled={(parseInt(uiFontSize, 10) || 13) >= 24}
            >+</button>
          </div>
        </div>
      </div>

      <div class="setting-field">
        <span class="setting-label">Terminal Font</span>
        <div class="setting-row">
          <div class="custom-dropdown dropdown-grow">
            <button
              class="dropdown-trigger"
              onclick={() => { termFontDropdownOpen = !termFontDropdownOpen; themeDropdownOpen = false; uiFontDropdownOpen = false; }}
              aria-haspopup="listbox"
              aria-expanded={termFontDropdownOpen}
            >
              <span class="dropdown-label" style={termFont ? `font-family: '${termFont}', monospace` : ''}>{termFontLabel}</span>
              <span class="dropdown-arrow">{termFontDropdownOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {#if termFontDropdownOpen}
              <div class="dropdown-menu" role="listbox">
                {#each TERM_FONTS as f}
                  <button
                    class="dropdown-option"
                    class:active={f.value === termFont}
                    role="option"
                    aria-selected={f.value === termFont}
                    style={f.value ? `font-family: '${f.value}', monospace` : ''}
                    onclick={() => handleTermFontChange(f.value)}
                  >
                    <span class="dropdown-option-label">{f.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="size-control">
            <button
              class="size-btn"
              onclick={() => handleTermFontSizeChange(String((parseInt(termFontSize, 10) || 13) - 1))}
              disabled={(parseInt(termFontSize, 10) || 13) <= 8}
            >&minus;</button>
            <input
              type="number"
              min="8"
              max="24"
              value={termFontSize || '13'}
              class="size-input"
              onchange={e => handleTermFontSizeChange((e.target as HTMLInputElement).value)}
            />
            <span class="size-unit">px</span>
            <button
              class="size-btn"
              onclick={() => handleTermFontSizeChange(String((parseInt(termFontSize, 10) || 13) + 1))}
              disabled={(parseInt(termFontSize, 10) || 13) >= 24}
            >+</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h2>Defaults</h2>
    <div class="settings-list">
      <div class="setting-field">
        <label for="default-shell" class="setting-label">Shell</label>
        <input
          id="default-shell"
          value={defaultShell}
          placeholder="/bin/bash"
          onchange={e => { defaultShell = (e.target as HTMLInputElement).value; saveGlobalSetting('default_shell', defaultShell); }}
        />
      </div>
      <div class="setting-field">
        <label for="default-cwd" class="setting-label">Working directory</label>
        <div class="input-with-browse">
          <input
            id="default-cwd"
            value={defaultCwd}
            placeholder="~"
            onchange={e => { defaultCwd = (e.target as HTMLInputElement).value; saveGlobalSetting('default_cwd', defaultCwd); }}
          />
          <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) { defaultCwd = d; saveGlobalSetting('default_cwd', d); } }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h2>Groups</h2>
    <div class="group-list">
      {#each groups as group}
        <div class="group-row" class:active={group.id === activeGroupId}>
          <button class="group-name" onclick={() => switchGroup(group.id)}>
            {group.name}
          </button>
          <span class="group-count">{group.projects.length} projects</span>
          {#if groups.length > 1}
            <button class="btn-danger" onclick={() => removeGroup(group.id)}>Remove</button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="add-form">
      <input bind:value={newGroupName} placeholder="New group name" />
      <button class="btn-primary" onclick={handleAddGroup} disabled={!newGroupName.trim()}>
        Add Group
      </button>
    </div>
  </section>

  {#if activeGroup}
    <section class="settings-section">
      <h2>Projects in "{activeGroup.name}"</h2>

      {#each activeGroup.projects as project}
        <div class="project-settings-row">
          <label class="project-field project-field-grow">
            <span class="field-label">Name</span>
            <input
              value={project.name}
              onchange={e => updateProject(activeGroupId, project.id, { name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="project-field project-field-grow">
            <span class="field-label">CWD</span>
            <div class="input-with-browse">
              <input
                value={project.cwd}
                onchange={e => updateProject(activeGroupId, project.id, { cwd: (e.target as HTMLInputElement).value })}
              />
              <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) updateProject(activeGroupId, project.id, { cwd: d }); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </label>
          <div class="project-field icon-field">
            <span class="field-label">Icon</span>
            <button
              class="icon-trigger"
              onclick={(e) => {
                const btn = e.currentTarget as HTMLElement;
                const popup = btn.nextElementSibling as HTMLElement;
                popup.classList.toggle('visible');
              }}
            >{project.icon || '📁'}</button>
            <div class="icon-picker">
              {#each PROJECT_ICONS as emoji}
                <button
                  class="icon-option"
                  class:active={project.icon === emoji}
                  onclick={(e) => {
                    updateProject(activeGroupId, project.id, { icon: emoji });
                    ((e.currentTarget as HTMLElement).closest('.icon-picker') as HTMLElement).classList.remove('visible');
                  }}
                >{emoji}</button>
              {/each}
            </div>
          </div>
          <label class="project-field">
            <span class="field-label">Enabled</span>
            <input
              type="checkbox"
              checked={project.enabled}
              onchange={e => updateProject(activeGroupId, project.id, { enabled: (e.target as HTMLInputElement).checked })}
            />
          </label>
          <button class="btn-danger" onclick={() => removeProject(activeGroupId, project.id)}>
            Remove
          </button>
        </div>
      {/each}

      {#if activeGroup.projects.length < 5}
        <div class="add-form">
          <input bind:value={newName} placeholder="Project name" />
          <div class="input-with-browse add-form-path">
            <input bind:value={newCwd} placeholder="/path/to/project" />
            <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) newCwd = d; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <button class="btn-primary" onclick={handleAddProject} disabled={!newName.trim() || !newCwd.trim()}>
            Add Project
          </button>
        </div>
      {:else}
        <p class="limit-notice">Maximum 5 projects per group reached.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .settings-tab {
    padding: 0.75rem 1rem;
    overflow-y: auto;
    height: 100%;
    min-width: 22em;
  }

  h2 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .settings-section {
    margin-bottom: 20px;
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setting-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-label {
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .setting-field > input,
  .setting-field .input-with-browse input {
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .setting-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  /* Reusable custom dropdown */
  .custom-dropdown {
    position: relative;
  }

  .dropdown-grow {
    flex: 1;
    min-width: 0;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    height: 100%;
  }

  .dropdown-trigger:hover {
    border-color: var(--ctp-surface2);
  }

  .dropdown-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-arrow {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    width: max-content;
    max-height: 360px;
    overflow-y: auto;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
    padding: 4px 0;
  }

  .dropdown-group-label {
    padding: 6px 10px 2px;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    color: var(--ctp-subtext1);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-option:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .dropdown-option.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .dropdown-option-label {
    flex: 1;
  }

  /* Theme-specific dropdown extras */
  .theme-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid;
    flex-shrink: 0;
  }

  .theme-colors {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .color-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* Size control (shared by UI and Terminal font) */
  .size-control {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .size-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .size-btn:hover {
    background: var(--ctp-surface1);
  }

  .size-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .size-input {
    width: 40px;
    padding: 4px 2px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    text-align: center;
    -moz-appearance: textfield;
  }

  .size-input::-webkit-inner-spin-button,
  .size-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  .size-unit {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    margin-right: 2px;
  }

  /* Groups & Projects */
  .group-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border-radius: 4px;
  }

  .group-row.active {
    border-left: 3px solid var(--ctp-blue);
  }

  .group-name {
    background: transparent;
    border: none;
    color: var(--ctp-text);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    flex: 1;
    text-align: left;
  }

  .group-count {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .project-settings-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px;
    background: var(--ctp-surface0);
    border-radius: 4px;
    margin-bottom: 4px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .project-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .project-field-grow {
    flex: 1;
  }

  .field-label {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
  }

  .project-field input:not([type="checkbox"]) {
    padding: 4px 8px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    min-width: 0;
    width: 100%;
  }

  .icon-field {
    position: relative;
  }

  .icon-trigger {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    font-size: 1rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .icon-trigger:hover {
    border-color: var(--ctp-overlay0);
  }

  .icon-picker {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 20;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    padding: 0.375rem;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    width: max-content;
  }

  .icon-picker.visible {
    display: grid;
  }

  .icon-option {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .icon-option:hover {
    background: var(--ctp-surface0);
  }

  .icon-option.active {
    background: var(--ctp-surface1);
    border-color: var(--ctp-blue);
  }

  .add-form {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    min-width: 0;
  }

  .add-form input {
    padding: 5px 10px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
  }

  .btn-primary {
    padding: 5px 14px;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 3px;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 4px 10px;
    background: transparent;
    color: var(--ctp-red);
    border: 1px solid var(--ctp-red);
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .limit-notice {
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    font-style: italic;
  }

  .input-with-browse {
    display: flex;
    gap: 4px;
    align-items: stretch;
  }

  .input-with-browse input {
    flex: 1;
    min-width: 0;
  }

  .add-form-path {
    flex: 1;
    min-width: 0;
  }

  .browse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-subtext0);
    cursor: pointer;
    flex-shrink: 0;
  }

  .browse-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface1);
  }
</style>
