<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getActiveProjectId,
    getActiveGroup,
    getActiveGroupId,
    getAllGroups,
    updateProject,
    updateAgent,
    addProject,
    removeProject,
    addGroup,
    removeGroup,
    switchGroup,
  } from '../../stores/workspace.svelte';
  import { deriveIdentifier, type GroupAgentRole, AGENT_ROLE_ICONS } from '../../types/groups';
  import { ProjectId, GroupId } from '../../types/ids';
  import { generateAgentPrompt } from '../../utils/agent-prompts';
  import { getSetting, setSetting } from '../../adapters/settings-bridge';
  import { getCurrentTheme, setTheme } from '../../stores/theme.svelte';
  import { THEME_LIST, getPalette, type ThemeId } from '../../styles/themes';
  import { listProfiles, type ClaudeProfile } from '../../adapters/claude-bridge';
  import { invoke } from '@tauri-apps/api/core';
  import { getProviders } from '../../providers/registry.svelte';
  import type { ProviderId, ProviderSettings } from '../../providers/types';
  import { ANCHOR_BUDGET_SCALES, ANCHOR_BUDGET_SCALE_LABELS, type AnchorBudgetScale } from '../../types/anchors';
  import { WAKE_STRATEGIES, WAKE_STRATEGY_LABELS, WAKE_STRATEGY_DESCRIPTIONS, type WakeStrategy } from '../../types/wake';
  import {
    storeSecret, getSecret, deleteSecret, listSecrets,
    hasKeyring, knownSecretKeys, SECRET_KEY_LABELS,
  } from '../../adapters/secrets-bridge';
  import {
    checkForUpdates,
    getCurrentVersion,
    getLastCheckTimestamp,
    type UpdateInfo,
  } from '../../utils/updater';
  import {
    getPluginEntries,
    setPluginEnabled,
    reloadAllPlugins,
    type PluginEntry,
  } from '../../stores/plugins.svelte';

  const PROJECT_ICONS = [
    '📁', '🚀', '🤖', '🌐', '🔧', '🎮', '📱', '💻',
    '🔬', '📊', '🎨', '🔒', '💬', '📦', '⚡', '🧪',
    '🏗️', '📝', '🎯', '💡', '🔥', '🛠️', '🧩', '🗄️',
  ];

  // Claude profiles for account selector
  let profiles = $state<ClaudeProfile[]>([]);

  // Provider settings (keyed by ProviderId)
  let providerSettings = $state<Record<string, ProviderSettings>>({});
  let expandedProvider = $state<string | null>(null);
  let registeredProviders = $derived(getProviders());
  let providerDropdownOpenFor = $state<string | null>(null);

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
  let projectMaxAspect = $state('1.0');
  let filesSaveOnBlur = $state(false);
  let selectedTheme = $state<ThemeId>(getCurrentTheme());

  // Updater state
  let appVersion = $state('');
  let updateCheckResult = $state<UpdateInfo | null>(null);
  let updateChecking = $state(false);
  let updateLastCheck = $state<string>('');

  // Secrets state
  let keyringAvailable = $state(false);
  let storedKeys = $state<string[]>([]);
  let knownKeys = $state<string[]>([]);
  let revealedKey = $state<string | null>(null);
  let revealedValue = $state('');
  let newSecretKey = $state('');
  let newSecretValue = $state('');
  let secretsKeyDropdownOpen = $state(false);
  let secretsSaving = $state(false);

  // Dropdown open states
  let themeDropdownOpen = $state(false);
  let uiFontDropdownOpen = $state(false);
  let termFontDropdownOpen = $state(false);

  // Per-project icon picker & profile dropdown (keyed by project id)
  let iconPickerOpenFor = $state<string | null>(null);
  let profileDropdownOpenFor = $state<string | null>(null);

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
    const [shell, cwd, font, size, tfont, tsize, aspect, saveOnBlur] = await Promise.all([
      getSetting('default_shell'),
      getSetting('default_cwd'),
      getSetting('ui_font_family'),
      getSetting('ui_font_size'),
      getSetting('term_font_family'),
      getSetting('term_font_size'),
      getSetting('project_max_aspect'),
      getSetting('files_save_on_blur'),
    ]);
    defaultShell = shell ?? '';
    defaultCwd = cwd ?? '';
    uiFont = font ?? '';
    uiFontSize = size ?? '';
    termFont = tfont ?? '';
    termFontSize = tsize ?? '';
    projectMaxAspect = aspect ?? '1.0';
    filesSaveOnBlur = saveOnBlur === 'true';
    applyAspectRatio(projectMaxAspect);
    selectedTheme = getCurrentTheme();

    try {
      profiles = await listProfiles();
    } catch {
      profiles = [];
    }

    // Load provider settings
    try {
      const raw = await getSetting('provider_settings');
      if (raw) providerSettings = JSON.parse(raw);
    } catch {
      providerSettings = {};
    }

    // Load secrets state
    try {
      keyringAvailable = await hasKeyring();
      if (keyringAvailable) {
        storedKeys = await listSecrets();
        knownKeys = await knownSecretKeys();
      }
    } catch {
      keyringAvailable = false;
    }

    // Load app version for updater section
    appVersion = await getCurrentVersion();
    const ts = getLastCheckTimestamp();
    if (ts) updateLastCheck = new Date(ts).toLocaleString();
  });

  function applyCssProp(prop: string, value: string) {
    document.documentElement.style.setProperty(prop, value);
  }

  async function handleCheckForUpdates() {
    updateChecking = true;
    try {
      updateCheckResult = await checkForUpdates();
      updateLastCheck = new Date().toLocaleString();
    } catch {
      updateCheckResult = { available: false };
    } finally {
      updateChecking = false;
    }
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

  function applyAspectRatio(value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    document.documentElement.style.setProperty('--project-max-aspect', value);
  }

  async function handleAspectChange(value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0.3 || num > 3.0) return;
    projectMaxAspect = value;
    applyAspectRatio(value);
    await saveGlobalSetting('project_max_aspect', value);
  }

  async function handleThemeChange(themeId: ThemeId) {
    selectedTheme = themeId;
    themeDropdownOpen = false;
    await setTheme(themeId);
  }

  async function saveProviderSettings() {
    await saveGlobalSetting('provider_settings', JSON.stringify(providerSettings));
  }

  function toggleProviderEnabled(providerId: string) {
    const current = providerSettings[providerId] ?? { enabled: true, config: {} };
    providerSettings[providerId] = { ...current, enabled: !current.enabled };
    providerSettings = { ...providerSettings };
    saveProviderSettings();
  }

  function setProviderModel(providerId: string, model: string) {
    const current = providerSettings[providerId] ?? { enabled: true, config: {} };
    providerSettings[providerId] = { ...current, defaultModel: model || undefined };
    providerSettings = { ...providerSettings };
    saveProviderSettings();
  }

  function isProviderEnabled(providerId: string): boolean {
    return providerSettings[providerId]?.enabled ?? true;
  }

  // --- Secrets handlers ---

  async function handleRevealSecret(key: string) {
    if (revealedKey === key) {
      revealedKey = null;
      revealedValue = '';
      return;
    }
    try {
      const val = await getSecret(key);
      revealedKey = key;
      revealedValue = val ?? '';
    } catch (e) {
      console.error(`Failed to reveal secret '${key}':`, e);
    }
  }

  async function handleSaveSecret() {
    if (!newSecretKey || !newSecretValue) return;
    secretsSaving = true;
    try {
      await storeSecret(newSecretKey, newSecretValue);
      storedKeys = await listSecrets();
      newSecretKey = '';
      newSecretValue = '';
      // If we just saved the currently revealed key, clear reveal
      revealedKey = null;
      revealedValue = '';
    } catch (e) {
      console.error('Failed to store secret:', e);
    } finally {
      secretsSaving = false;
    }
  }

  async function handleDeleteSecret(key: string) {
    try {
      await deleteSecret(key);
      storedKeys = await listSecrets();
      if (revealedKey === key) {
        revealedKey = null;
        revealedValue = '';
      }
    } catch (e) {
      console.error(`Failed to delete secret '${key}':`, e);
    }
  }

  function getSecretKeyLabel(key: string): string {
    return SECRET_KEY_LABELS[key] ?? key;
  }

  let availableKeysForAdd = $derived(
    knownKeys.filter(k => !storedKeys.includes(k)),
  );

  let newSecretKeyLabel = $derived(
    newSecretKey ? getSecretKeyLabel(newSecretKey) : 'Select key...',
  );

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
      providerDropdownOpenFor = null;
      secretsKeyDropdownOpen = false;
    }
    if (!target.closest('.icon-field')) {
      iconPickerOpenFor = null;
    }
    if (!target.closest('.profile-field')) {
      profileDropdownOpenFor = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
      iconPickerOpenFor = null;
      profileDropdownOpenFor = null;
      secretsKeyDropdownOpen = false;
    }
  }

  function getProfileLabel(profileName: string): string {
    const p = profiles.find(pr => pr.name === profileName);
    return p?.display_name || p?.name || profileName || 'default';
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
    const id = ProjectId(crypto.randomUUID());
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

  // Plugin entries (reactive from store)
  let pluginEntries = $derived(getPluginEntries());

  async function handleReloadPlugins() {
    await reloadAllPlugins(activeGroupId);
  }

  // New group form
  let newGroupName = $state('');

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    const id = GroupId(crypto.randomUUID());
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
      <div class="setting-field">
        <span class="setting-label">Project max aspect ratio</span>
        <div class="size-control">
          <button
            class="size-btn"
            onclick={() => handleAspectChange((Math.max(0.3, parseFloat(projectMaxAspect) - 0.1)).toFixed(1))}
            disabled={parseFloat(projectMaxAspect) <= 0.3}
          >&minus;</button>
          <input
            type="number"
            min="0.3"
            max="3.0"
            step="0.1"
            value={projectMaxAspect}
            class="size-input"
            onchange={e => handleAspectChange((e.target as HTMLInputElement).value)}
          />
          <span class="size-unit">w:h</span>
          <button
            class="size-btn"
            onclick={() => handleAspectChange((Math.min(3.0, parseFloat(projectMaxAspect) + 0.1)).toFixed(1))}
            disabled={parseFloat(projectMaxAspect) >= 3.0}
          >+</button>
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

    <h3 class="subsection-title">Editor</h3>
    <div class="settings-grid">
      <div class="setting-field">
        <label class="setting-label toggle-label">
          <span>Save on blur</span>
          <button
            class="toggle-switch"
            class:on={filesSaveOnBlur}
            role="switch"
            aria-checked={filesSaveOnBlur}
            onclick={() => { filesSaveOnBlur = !filesSaveOnBlur; saveGlobalSetting('files_save_on_blur', String(filesSaveOnBlur)); }}
          >
            <span class="toggle-thumb"></span>
          </button>
        </label>
        <span class="setting-hint">Auto-save files when the editor loses focus</span>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h2>Updates</h2>
    <div class="settings-list">
      <div class="setting-field">
        <span class="setting-label">Current version</span>
        <span class="setting-value">{appVersion || '...'}</span>
      </div>
      {#if updateLastCheck}
        <div class="setting-field">
          <span class="setting-label">Last checked</span>
          <span class="setting-value setting-muted">{updateLastCheck}</span>
        </div>
      {/if}
      {#if updateCheckResult?.available}
        <div class="setting-field">
          <span class="setting-label">Available</span>
          <span class="setting-value update-available">v{updateCheckResult.version}</span>
        </div>
      {/if}
      <div class="setting-field">
        <button
          class="btn-primary"
          onclick={handleCheckForUpdates}
          disabled={updateChecking}
        >
          {updateChecking ? 'Checking...' : 'Check for Updates'}
        </button>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h2>Providers</h2>
    <div class="provider-list">
      {#each registeredProviders as provider}
        <div class="provider-panel" class:disabled={!isProviderEnabled(provider.id)}>
          <button
            class="provider-header"
            onclick={() => { expandedProvider = expandedProvider === provider.id ? null : provider.id; }}
          >
            <span class="provider-name">{provider.name}</span>
            <span class="provider-desc">{provider.description}</span>
            <span class="provider-chevron">{expandedProvider === provider.id ? '\u25B4' : '\u25BE'}</span>
          </button>
          {#if expandedProvider === provider.id}
            <div class="provider-body">
              <div class="setting-field">
                <label class="setting-label toggle-label">
                  <span>Enabled</span>
                  <button
                    class="toggle-switch"
                    class:on={isProviderEnabled(provider.id)}
                    role="switch"
                    aria-checked={isProviderEnabled(provider.id)}
                    onclick={() => toggleProviderEnabled(provider.id)}
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </label>
              </div>
              {#if provider.capabilities.hasModelSelection}
                <div class="setting-field">
                  <span class="setting-label">Default model</span>
                  <input
                    value={providerSettings[provider.id]?.defaultModel ?? provider.defaultModel ?? ''}
                    placeholder={provider.defaultModel ?? 'default'}
                    onchange={e => setProviderModel(provider.id, (e.target as HTMLInputElement).value)}
                  />
                </div>
              {/if}
              <div class="provider-caps">
                <span class="setting-label">Capabilities</span>
                <div class="caps-grid">
                  {#if provider.capabilities.hasProfiles}<span class="cap-badge">Profiles</span>{/if}
                  {#if provider.capabilities.hasSkills}<span class="cap-badge">Skills</span>{/if}
                  {#if provider.capabilities.supportsSubagents}<span class="cap-badge">Subagents</span>{/if}
                  {#if provider.capabilities.supportsCost}<span class="cap-badge">Cost tracking</span>{/if}
                  {#if provider.capabilities.supportsResume}<span class="cap-badge">Resume</span>{/if}
                  {#if provider.capabilities.hasSandbox}<span class="cap-badge">Sandbox</span>{/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <section class="settings-section">
    <h2>Secrets</h2>
    <div class="secrets-status">
      <span class="keyring-indicator" class:available={keyringAvailable} class:unavailable={!keyringAvailable}></span>
      <span class="keyring-label">
        {keyringAvailable ? 'System keyring available' : 'System keyring unavailable'}
      </span>
    </div>

    {#if !keyringAvailable}
      <div class="secrets-warning">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>System keyring not available. Secrets cannot be stored securely.</span>
      </div>
    {:else}
      {#if storedKeys.length > 0}
        <div class="secrets-list">
          {#each storedKeys as key}
            <div class="secret-row">
              <div class="secret-info">
                <span class="secret-key-name">{getSecretKeyLabel(key)}</span>
                <span class="secret-key-id">{key}</span>
              </div>
              <div class="secret-value-area">
                {#if revealedKey === key}
                  <input
                    type="text"
                    class="secret-value-input"
                    value={revealedValue}
                    readonly
                  />
                {:else}
                  <span class="secret-masked">{'\u25CF'.repeat(8)}</span>
                {/if}
              </div>
              <div class="secret-actions">
                <button
                  class="secret-btn"
                  title={revealedKey === key ? 'Hide' : 'Reveal'}
                  onclick={() => handleRevealSecret(key)}
                >
                  {#if revealedKey === key}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {/if}
                </button>
                <button
                  class="secret-btn secret-btn-danger"
                  title="Delete"
                  onclick={() => handleDeleteSecret(key)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="secret-add-form">
        <div class="secret-add-row">
          <div class="custom-dropdown secret-key-dropdown">
            <button
              class="dropdown-trigger"
              onclick={() => { secretsKeyDropdownOpen = !secretsKeyDropdownOpen; }}
              aria-haspopup="listbox"
              aria-expanded={secretsKeyDropdownOpen}
            >
              <span class="dropdown-label">{newSecretKeyLabel}</span>
              <span class="dropdown-arrow">{secretsKeyDropdownOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {#if secretsKeyDropdownOpen}
              <div class="dropdown-menu" role="listbox">
                {#each availableKeysForAdd as key}
                  <button
                    class="dropdown-option"
                    class:active={newSecretKey === key}
                    role="option"
                    aria-selected={newSecretKey === key}
                    onclick={() => { newSecretKey = key; secretsKeyDropdownOpen = false; }}
                  >
                    <span class="dropdown-option-label">{getSecretKeyLabel(key)}</span>
                    <span class="secret-key-hint">{key}</span>
                  </button>
                {/each}
                {#if availableKeysForAdd.length === 0}
                  <span class="dropdown-empty">All keys configured</span>
                {/if}
              </div>
            {/if}
          </div>
          <input
            type="password"
            class="secret-value-new"
            bind:value={newSecretValue}
            placeholder="Secret value"
            disabled={!newSecretKey}
          />
          <button
            class="btn-primary"
            onclick={handleSaveSecret}
            disabled={!newSecretKey || !newSecretValue || secretsSaving}
          >
            {secretsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    {/if}
  </section>

  <section class="settings-section">
    <h2>Plugins</h2>
    {#if pluginEntries.length === 0}
      <p class="empty-notice">No plugins found in ~/.config/bterminal/plugins/</p>
    {:else}
      <div class="plugin-list">
        {#each pluginEntries as entry (entry.meta.id)}
          <div class="plugin-row">
            <div class="plugin-info">
              <span class="plugin-name">{entry.meta.name}</span>
              <span class="plugin-version">v{entry.meta.version}</span>
              {#if entry.status === 'loaded'}
                <span class="plugin-badge loaded" title="Loaded">loaded</span>
              {:else if entry.status === 'error'}
                <span class="plugin-badge error" title={entry.error ?? 'Error'}>error</span>
              {:else if entry.status === 'disabled'}
                <span class="plugin-badge disabled">disabled</span>
              {:else}
                <span class="plugin-badge discovered">discovered</span>
              {/if}
            </div>
            {#if entry.meta.description}
              <p class="plugin-desc">{entry.meta.description}</p>
            {/if}
            {#if entry.meta.permissions.length > 0}
              <div class="plugin-perms">
                {#each entry.meta.permissions as perm}
                  <span class="perm-badge">{perm}</span>
                {/each}
              </div>
            {/if}
            {#if entry.error}
              <p class="plugin-error">{entry.error}</p>
            {/if}
            <label class="card-toggle" title={entry.status === 'disabled' ? 'Disabled' : 'Enabled'}>
              <input
                type="checkbox"
                checked={entry.status !== 'disabled'}
                onchange={async (e) => {
                  const enabled = (e.target as HTMLInputElement).checked;
                  await setPluginEnabled(entry.meta.id, enabled);
                }}
              />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        {/each}
      </div>
    {/if}
    <button class="btn-primary reload-plugins-btn" onclick={handleReloadPlugins}>
      Reload Plugins
    </button>
  </section>

  <section class="settings-section">
    <h2>Groups</h2>
    <div class="group-list">
      {#each groups as group}
        <div class="group-row" class:active={group.id === activeGroupId}>
          <button class="group-name" onclick={async () => await switchGroup(group.id)}>
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

  {#if activeGroup && (activeGroup.agents?.length ?? 0) > 0}
    <section class="settings-section">
      <h2>Agents in "{activeGroup.name}"</h2>

      <div class="agent-cards">
        {#each activeGroup.agents ?? [] as agent (agent.id)}
          <div class="agent-config-card">
            <div class="card-top-row">
              <span class="agent-config-icon">{AGENT_ROLE_ICONS[agent.role] ?? '🤖'}</span>
              <input
                class="card-name-input"
                value={agent.name}
                placeholder="Agent name"
                onchange={e => updateAgent(activeGroupId, agent.id, { name: (e.target as HTMLInputElement).value })}
              />
              <span class="agent-role-badge">{agent.role}</span>
              <label class="card-toggle" title={agent.enabled ? 'Enabled' : 'Disabled'}>
                <input
                  type="checkbox"
                  checked={agent.enabled}
                  onchange={e => updateAgent(activeGroupId, agent.id, { enabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z"/></svg>
                Working Directory
              </span>
              <div class="input-with-browse">
                <input
                  class="cwd-input"
                  value={agent.cwd ?? ''}
                  placeholder="Inherits from group"
                  title={agent.cwd ?? 'Inherits from first project'}
                  onchange={e => updateAgent(activeGroupId, agent.id, { cwd: (e.target as HTMLInputElement).value || undefined })}
                />
                <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) updateAgent(activeGroupId, agent.id, { cwd: d }); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Model
              </span>
              <input
                class="card-field-input"
                value={agent.model ?? ''}
                placeholder="Default (provider default)"
                onchange={e => updateAgent(activeGroupId, agent.id, { model: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>

            {#if agent.role === 'manager'}
              <div class="card-field">
                <span class="card-field-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Wake Interval
                </span>
                <div class="scale-slider">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="1"
                    value={agent.wakeIntervalMin ?? 3}
                    oninput={e => updateAgent(activeGroupId, agent.id, { wakeIntervalMin: parseInt((e.target as HTMLInputElement).value) })}
                  />
                  <span class="scale-label">{agent.wakeIntervalMin ?? 3} min</span>
                </div>
              </div>

              <div class="card-field">
                <span class="card-field-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Wake Strategy
                </span>
                <div class="wake-strategy-row">
                  {#each WAKE_STRATEGIES as strat}
                    <button
                      class="strategy-btn"
                      class:active={(agent.wakeStrategy ?? 'smart') === strat}
                      title={WAKE_STRATEGY_DESCRIPTIONS[strat]}
                      onclick={() => updateAgent(activeGroupId, agent.id, { wakeStrategy: strat })}
                    >{WAKE_STRATEGY_LABELS[strat]}</button>
                  {/each}
                </div>
                <span class="setting-hint">{WAKE_STRATEGY_DESCRIPTIONS[agent.wakeStrategy ?? 'smart']}</span>
              </div>

              {#if (agent.wakeStrategy ?? 'smart') === 'smart'}
                <div class="card-field">
                  <span class="card-field-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                    Wake Threshold
                  </span>
                  <div class="scale-slider">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={agent.wakeThreshold ?? 0.5}
                      oninput={e => updateAgent(activeGroupId, agent.id, { wakeThreshold: parseFloat((e.target as HTMLInputElement).value) })}
                    />
                    <span class="scale-label">{((agent.wakeThreshold ?? 0.5) * 100).toFixed(0)}%</span>
                  </div>
                  <span class="setting-hint">Only wakes when signal score exceeds this level</span>
                </div>
              {/if}
            {/if}

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Custom Context
              </span>
              <textarea
                class="agent-prompt-input"
                value={agent.systemPrompt ?? ''}
                placeholder="Additional instructions for this agent (appended to auto-generated context)"
                rows="3"
                onchange={e => updateAgent(activeGroupId, agent.id, { systemPrompt: (e.target as HTMLTextAreaElement).value || undefined })}
              ></textarea>
            </div>

            <details class="prompt-preview">
              <summary class="prompt-preview-toggle">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview full introductory prompt
              </summary>
              <pre class="prompt-preview-content">{generateAgentPrompt({
                role: agent.role as GroupAgentRole,
                agentId: agent.id,
                agentName: agent.name,
                group: activeGroup,
                customPrompt: agent.systemPrompt,
              })}</pre>
            </details>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if activeGroup}
    <section class="settings-section">
      <h2>Projects in "{activeGroup.name}"</h2>

      <div class="project-cards">
        {#each activeGroup.projects as project}
          <div class="project-card">
            <div class="card-top-row">
              <div class="icon-field">
                <button
                  class="icon-trigger"
                  onclick={() => { iconPickerOpenFor = iconPickerOpenFor === project.id ? null : project.id; }}
                  title="Choose icon"
                >{project.icon || '📁'}</button>
                {#if iconPickerOpenFor === project.id}
                  <div class="icon-picker">
                    {#each PROJECT_ICONS as emoji}
                      <button
                        class="icon-option"
                        class:active={project.icon === emoji}
                        onclick={() => {
                          updateProject(activeGroupId, project.id, { icon: emoji });
                          iconPickerOpenFor = null;
                        }}
                      >{emoji}</button>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="card-name-area">
                <input
                  class="card-name-input"
                  value={project.name}
                  placeholder="Project name"
                  onchange={e => updateProject(activeGroupId, project.id, { name: (e.target as HTMLInputElement).value })}
                />
              </div>
              <label class="card-toggle" title={project.enabled ? 'Enabled' : 'Disabled'}>
                <input
                  type="checkbox"
                  checked={project.enabled}
                  onchange={e => updateProject(activeGroupId, project.id, { enabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z"/></svg>
                Path
              </span>
              <div class="input-with-browse">
                <input
                  class="cwd-input"
                  value={project.cwd}
                  placeholder="/path/to/project"
                  title={project.cwd}
                  onchange={e => updateProject(activeGroupId, project.id, { cwd: (e.target as HTMLInputElement).value })}
                />
                <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) updateProject(activeGroupId, project.id, { cwd: d }); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>

            <div class="card-field profile-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Account
              </span>
              {#if profiles.length > 1}
                <div class="custom-dropdown">
                  <button
                    class="dropdown-trigger profile-trigger"
                    onclick={() => { profileDropdownOpenFor = profileDropdownOpenFor === project.id ? null : project.id; }}
                    aria-haspopup="listbox"
                    aria-expanded={profileDropdownOpenFor === project.id}
                  >
                    <span class="profile-badge">{getProfileLabel(project.profile)}</span>
                    <span class="dropdown-arrow">{profileDropdownOpenFor === project.id ? '\u25B4' : '\u25BE'}</span>
                  </button>
                  {#if profileDropdownOpenFor === project.id}
                    <div class="dropdown-menu profile-menu" role="listbox">
                      {#each profiles as prof}
                        <button
                          class="dropdown-option"
                          class:active={project.profile === prof.name}
                          role="option"
                          aria-selected={project.profile === prof.name}
                          onclick={() => {
                            updateProject(activeGroupId, project.id, { profile: prof.name });
                            profileDropdownOpenFor = null;
                          }}
                        >
                          <span class="profile-option-name">{prof.display_name || prof.name}</span>
                          {#if prof.email}
                            <span class="profile-option-email">{prof.email}</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <span class="profile-single">{getProfileLabel(project.profile)}</span>
              {/if}
            </div>

            {#if registeredProviders.length > 1}
              <div class="card-field">
                <span class="card-field-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  Provider
                </span>
                <div class="custom-dropdown">
                  <button
                    class="dropdown-trigger provider-trigger"
                    onclick={() => { providerDropdownOpenFor = providerDropdownOpenFor === project.id ? null : project.id; }}
                    aria-haspopup="listbox"
                    aria-expanded={providerDropdownOpenFor === project.id}
                  >
                    <span class="dropdown-label">{registeredProviders.find(p => p.id === (project.provider ?? 'claude'))?.name ?? 'Claude Code'}</span>
                    <span class="dropdown-arrow">{providerDropdownOpenFor === project.id ? '\u25B4' : '\u25BE'}</span>
                  </button>
                  {#if providerDropdownOpenFor === project.id}
                    <div class="dropdown-menu" role="listbox">
                      {#each registeredProviders.filter(p => isProviderEnabled(p.id)) as prov}
                        <button
                          class="dropdown-option"
                          class:active={(project.provider ?? 'claude') === prov.id}
                          role="option"
                          aria-selected={(project.provider ?? 'claude') === prov.id}
                          onclick={() => {
                            updateProject(activeGroupId, project.id, { provider: prov.id });
                            providerDropdownOpenFor = null;
                          }}
                        >
                          <span class="dropdown-option-label">{prov.name}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                Anchor Budget
              </span>
              <div class="scale-slider">
                <input
                  type="range"
                  min="0"
                  max={ANCHOR_BUDGET_SCALES.length - 1}
                  step="1"
                  value={ANCHOR_BUDGET_SCALES.indexOf(project.anchorBudgetScale ?? 'medium')}
                  oninput={(e) => {
                    const idx = parseInt((e.target as HTMLInputElement).value);
                    updateProject(activeGroupId, project.id, { anchorBudgetScale: ANCHOR_BUDGET_SCALES[idx] });
                  }}
                />
                <span class="scale-label">{ANCHOR_BUDGET_SCALE_LABELS[project.anchorBudgetScale ?? 'medium']}</span>
              </div>
            </div>

            <div class="card-field card-field-row">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v12"/><path d="M18 9a3 3 0 0 0-3-3H7"/><path d="M18 9v12"/></svg>
                Worktree Isolation
              </span>
              <label class="card-toggle" title={project.useWorktrees ? 'Worktrees enabled' : 'Worktrees disabled'}>
                <input
                  type="checkbox"
                  checked={project.useWorktrees ?? false}
                  onchange={e => updateProject(activeGroupId, project.id, { useWorktrees: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>

            <div class="card-field card-field-row">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Sandbox (Landlock)
              </span>
              <label class="card-toggle" title={project.sandboxEnabled ? 'Filesystem sandbox enabled' : 'Filesystem sandbox disabled'}>
                <input
                  type="checkbox"
                  checked={project.sandboxEnabled ?? false}
                  onchange={e => updateProject(activeGroupId, project.id, { sandboxEnabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Stall Threshold
              </span>
              <div class="scale-slider">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={project.stallThresholdMin ?? 15}
                  oninput={(e) => {
                    updateProject(activeGroupId, project.id, { stallThresholdMin: parseInt((e.target as HTMLInputElement).value) });
                  }}
                />
                <span class="scale-label">{project.stallThresholdMin ?? 15} min</span>
              </div>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Custom Context
              </span>
              <textarea
                class="agent-prompt-input"
                value={project.systemPrompt ?? ''}
                placeholder="Additional instructions injected into this project's agent session"
                rows="3"
                onchange={e => updateProject(activeGroupId, project.id, { systemPrompt: (e.target as HTMLTextAreaElement).value || undefined })}
              ></textarea>
            </div>

            <div class="card-footer">
              <button class="btn-remove" onclick={() => removeProject(activeGroupId, project.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                Remove
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#if activeGroup.projects.length < 5}
        <div class="add-project-form">
          <div class="add-form-row">
            <input class="add-name" bind:value={newName} placeholder="Project name" />
            <div class="input-with-browse add-form-path">
              <input bind:value={newCwd} placeholder="/path/to/project" />
              <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) newCwd = d; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <button class="btn-primary" onclick={handleAddProject} disabled={!newName.trim() || !newCwd.trim()}>
              + Add
            </button>
          </div>
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
    margin: 0 0 0.625rem;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .settings-section {
    margin-bottom: 1.25rem;
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .setting-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-label {
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .setting-value {
    font-size: 0.8rem;
    color: var(--ctp-text);
  }

  .setting-muted {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .update-available {
    color: var(--ctp-green);
    font-weight: 600;
  }

  .setting-field > input,
  .setting-field .input-with-browse input {
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .setting-row {
    display: flex;
    gap: 0.5rem;
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
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
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
    top: calc(100% + 0.25rem);
    left: 0;
    min-width: 100%;
    width: max-content;
    max-height: 22.5rem;
    overflow-y: auto;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.4);
    z-index: 100;
    padding: 0.25rem 0;
  }

  .dropdown-group-label {
    padding: 0.375rem 0.625rem 0.125rem;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3125rem 0.625rem;
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
    border-radius: 0.1875rem;
    border: 1px solid;
    flex-shrink: 0;
  }

  .theme-colors {
    display: flex;
    gap: 0.1875rem;
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
    gap: 0.125rem;
    flex-shrink: 0;
  }

  .size-btn {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
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
    width: 2.5rem;
    padding: 0.25rem 0.125rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
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
    margin-right: 0.125rem;
  }

  /* Groups */
  .group-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
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

  /* Project Cards */
  .project-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .project-card {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .project-card:hover {
    border-color: var(--ctp-surface2);
  }

  .card-top-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .card-name-area {
    flex: 1;
    min-width: 0;
  }

  .card-name-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.85rem;
    font-weight: 600;
    transition: border-color 0.15s, background 0.15s;
  }

  .card-name-input:hover {
    background: var(--ctp-base);
    border-color: var(--ctp-surface1);
  }

  .card-name-input:focus {
    background: var(--ctp-base);
    border-color: var(--ctp-blue);
    outline: none;
  }

  /* Toggle switch */
  .card-toggle {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  }

  .card-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    display: block;
    width: 2rem;
    height: 1.125rem;
    background: var(--ctp-surface2);
    border-radius: 0.5625rem;
    transition: background 0.2s;
    position: relative;
  }

  .card-toggle input:checked + .toggle-track {
    background: var(--ctp-green);
  }

  .toggle-thumb {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 0.875rem;
    height: 0.875rem;
    background: var(--ctp-text);
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .card-toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(0.875rem);
  }

  /* Card fields */
  .card-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-field.card-field-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .card-field-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .card-field-label svg {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .card-field .input-with-browse input {
    padding: 0.3125rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.78rem;
    font-family: var(--term-font-family, monospace);
  }

  /* Anchor budget scale slider */
  .scale-slider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .scale-slider input[type="range"] {
    flex: 1;
    height: 0.25rem;
    appearance: none;
    background: var(--ctp-surface1);
    border-radius: 0.125rem;
    outline: none;
    cursor: pointer;
  }

  .scale-slider input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: var(--ctp-blue);
    border: 2px solid var(--ctp-base);
    cursor: pointer;
  }

  .scale-label {
    font-size: 0.75rem;
    color: var(--ctp-subtext0);
    white-space: nowrap;
    min-width: 5.5em;
  }

  .wake-strategy-row {
    display: flex;
    gap: 0;
    border-radius: 0.25rem;
    overflow: hidden;
    border: 1px solid var(--ctp-surface1);
  }

  .strategy-btn {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: none;
    background: var(--ctp-surface0);
    color: var(--ctp-overlay1);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .strategy-btn:not(:last-child) {
    border-right: 1px solid var(--ctp-surface1);
  }

  .strategy-btn:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-subtext1);
  }

  .strategy-btn.active {
    background: color-mix(in srgb, var(--ctp-blue) 20%, var(--ctp-surface0));
    color: var(--ctp-blue);
    font-weight: 600;
  }

  /* CWD input: left-ellipsis */
  .cwd-input {
    direction: rtl;
    text-align: left;
    unicode-bidi: plaintext;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  /* Profile field */
  .profile-trigger {
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    font-size: 0.78rem;
  }

  .profile-badge {
    font-weight: 600;
    color: var(--ctp-blue);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-single {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ctp-blue);
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
  }

  .profile-menu {
    min-width: 12rem;
  }

  .profile-option-name {
    font-weight: 500;
    color: var(--ctp-text);
  }

  .profile-option-email {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    margin-left: auto;
  }

  /* Card footer */
  .card-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.25rem;
    border-top: 1px solid var(--ctp-surface1);
    margin-top: 0.125rem;
  }

  .btn-remove {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--ctp-overlay0);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .btn-remove:hover {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 8%, transparent);
  }

  /* Icon field & picker */
  .icon-field {
    position: relative;
    flex-shrink: 0;
  }

  .icon-trigger {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    font-size: 1.1rem;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .icon-trigger:hover {
    border-color: var(--ctp-overlay0);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ctp-blue) 15%, transparent);
  }

  .icon-picker {
    display: grid;
    position: absolute;
    top: calc(100% + 0.375rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    padding: 0.5rem;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
    width: max-content;
  }

  .icon-option {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.1s, transform 0.1s;
  }

  .icon-option:hover {
    background: var(--ctp-surface0);
    transform: scale(1.15);
  }

  .icon-option.active {
    background: var(--ctp-surface1);
    border-color: var(--ctp-blue);
  }

  /* Add project form */
  .add-project-form {
    margin-top: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: var(--ctp-mantle);
    border: 1px dashed var(--ctp-surface1);
    border-radius: 0.5rem;
  }

  .add-form-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .add-name {
    width: 8rem;
    flex-shrink: 0;
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.5rem;
    min-width: 0;
  }

  .add-form input {
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
  }

  .btn-primary {
    padding: 0.3125rem 0.875rem;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 0.25rem 0.625rem;
    background: transparent;
    color: var(--ctp-red);
    border: 1px solid var(--ctp-red);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .limit-notice {
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    font-style: italic;
    margin-top: 0.5rem;
  }

  .input-with-browse {
    display: flex;
    gap: 0.25rem;
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

  .add-form-path input {
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .browse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    cursor: pointer;
    flex-shrink: 0;
  }

  .browse-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface1);
  }

  .subsection-title {
    font-size: 0.725rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
    margin: 0.75rem 0 0.5rem;
  }

  .setting-hint {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .toggle-switch {
    position: relative;
    width: 2rem;
    height: 1.125rem;
    border: none;
    border-radius: 0.5625rem;
    background: var(--ctp-surface1);
    cursor: pointer;
    transition: background 0.2s;
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-switch.on {
    background: var(--ctp-blue);
  }

  .toggle-thumb {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: var(--ctp-text);
    transition: transform 0.2s;
  }

  .toggle-switch.on .toggle-thumb {
    transform: translateX(0.875rem);
  }

  /* Provider section */
  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .provider-panel {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    overflow: hidden;
    transition: opacity 0.15s;
  }

  .provider-panel.disabled {
    opacity: 0.5;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    cursor: pointer;
    text-align: left;
    font-size: 0.8rem;
  }

  .provider-header:hover {
    background: var(--ctp-base);
  }

  .provider-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .provider-desc {
    flex: 1;
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-chevron {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    flex-shrink: 0;
  }

  .provider-body {
    padding: 0.5rem 0.625rem;
    border-top: 1px solid var(--ctp-surface1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .provider-body > .setting-field > input {
    padding: 0.375rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .provider-caps {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .caps-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .cap-badge {
    padding: 0.125rem 0.5rem;
    background: color-mix(in srgb, var(--ctp-blue) 10%, transparent);
    color: var(--ctp-blue);
    border-radius: 0.75rem;
    font-size: 0.65rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .provider-trigger {
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    font-size: 0.78rem;
  }

  /* Agent config cards */
  .agent-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .agent-config-card {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-left: 3px solid var(--ctp-mauve);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .agent-config-card:hover {
    border-color: var(--ctp-surface2);
    border-left-color: var(--ctp-mauve);
  }

  .agent-config-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .agent-role-badge {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ctp-mauve);
    background: color-mix(in srgb, var(--ctp-mauve) 10%, transparent);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .card-field-input {
    padding: 0.3125rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.78rem;
  }

  .card-field-input:focus {
    border-color: var(--ctp-blue);
    outline: none;
  }

  .agent-prompt-input {
    padding: 0.375rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.75rem;
    font-family: var(--ui-font-family, sans-serif);
    line-height: 1.4;
    resize: vertical;
    min-height: 3rem;
  }

  .agent-prompt-input:focus {
    border-color: var(--ctp-blue);
    outline: none;
  }

  .agent-prompt-input::placeholder {
    color: var(--ctp-overlay0);
  }

  .prompt-preview {
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    overflow: hidden;
  }

  .prompt-preview-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.3125rem 0.5rem;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    cursor: pointer;
    user-select: none;
    transition: color 0.15s;
  }

  .prompt-preview-toggle:hover {
    color: var(--ctp-subtext0);
  }

  .prompt-preview-content {
    padding: 0.5rem;
    margin: 0;
    background: var(--ctp-base);
    color: var(--ctp-subtext0);
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 20rem;
    overflow-y: auto;
    border-top: 1px solid var(--ctp-surface1);
  }

  /* Secrets section */
  .secrets-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
  }

  .keyring-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .keyring-indicator.available {
    background: var(--ctp-green);
    box-shadow: 0 0 4px color-mix(in srgb, var(--ctp-green) 50%, transparent);
  }

  .keyring-indicator.unavailable {
    background: var(--ctp-red);
    box-shadow: 0 0 4px color-mix(in srgb, var(--ctp-red) 50%, transparent);
  }

  .keyring-label {
    font-size: 0.75rem;
    color: var(--ctp-subtext0);
  }

  .secrets-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: color-mix(in srgb, var(--ctp-red) 8%, var(--ctp-surface0));
    border: 1px solid color-mix(in srgb, var(--ctp-red) 30%, var(--ctp-surface1));
    border-radius: 0.375rem;
    color: var(--ctp-red);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .secrets-warning svg {
    flex-shrink: 0;
  }

  .secrets-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.625rem;
  }

  .secret-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    transition: border-color 0.15s;
  }

  .secret-row:hover {
    border-color: var(--ctp-surface2);
  }

  .secret-info {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    min-width: 0;
    flex-shrink: 0;
  }

  .secret-key-name {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ctp-text);
    white-space: nowrap;
  }

  .secret-key-id {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
  }

  .secret-value-area {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .secret-masked {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
  }

  .secret-value-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.75rem;
    font-family: var(--term-font-family, monospace);
  }

  .secret-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .secret-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: transparent;
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-overlay1);
    cursor: pointer;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }

  .secret-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
    border-color: var(--ctp-surface2);
  }

  .secret-btn-danger:hover {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 8%, transparent);
    border-color: color-mix(in srgb, var(--ctp-red) 30%, var(--ctp-surface1));
  }

  .secret-add-form {
    padding: 0.5rem 0.625rem;
    background: var(--ctp-mantle);
    border: 1px dashed var(--ctp-surface1);
    border-radius: 0.375rem;
  }

  .secret-add-row {
    display: flex;
    gap: 0.375rem;
    align-items: stretch;
  }

  .secret-key-dropdown {
    min-width: 10rem;
    flex-shrink: 0;
  }

  .secret-key-hint {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
    margin-left: auto;
    padding-left: 0.5rem;
  }

  .dropdown-empty {
    display: block;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    color: var(--ctp-overlay0);
    font-style: italic;
  }

  .secret-value-new {
    flex: 1;
    min-width: 0;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .secret-value-new:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .secret-value-new:focus {
    border-color: var(--ctp-blue);
    outline: none;
  }

  /* --- Plugins section --- */

  .plugin-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
  }

  .plugin-row {
    position: relative;
    background: var(--ctp-surface0);
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
  }

  .plugin-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.125rem;
  }

  .plugin-name {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .plugin-version {
    font-size: 0.68rem;
    color: var(--ctp-overlay0);
  }

  .plugin-badge {
    font-size: 0.6rem;
    padding: 0.05rem 0.3rem;
    border-radius: 0.1875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .plugin-badge.loaded {
    background: color-mix(in srgb, var(--ctp-green) 20%, transparent);
    color: var(--ctp-green);
  }

  .plugin-badge.error {
    background: color-mix(in srgb, var(--ctp-red) 20%, transparent);
    color: var(--ctp-red);
  }

  .plugin-badge.disabled {
    background: color-mix(in srgb, var(--ctp-overlay0) 20%, transparent);
    color: var(--ctp-overlay0);
  }

  .plugin-badge.discovered {
    background: color-mix(in srgb, var(--ctp-blue) 20%, transparent);
    color: var(--ctp-blue);
  }

  .plugin-desc {
    font-size: 0.75rem;
    color: var(--ctp-subtext0);
    margin: 0.125rem 0 0.25rem;
  }

  .plugin-perms {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-top: 0.125rem;
  }

  .perm-badge {
    font-size: 0.6rem;
    padding: 0.05rem 0.25rem;
    border-radius: 0.125rem;
    background: color-mix(in srgb, var(--ctp-mauve) 15%, transparent);
    color: var(--ctp-mauve);
    font-family: var(--font-mono, monospace);
  }

  .plugin-error {
    font-size: 0.7rem;
    color: var(--ctp-red);
    margin: 0.25rem 0 0;
    word-break: break-word;
  }

  .plugin-row .card-toggle {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .empty-notice {
    font-size: 0.78rem;
    color: var(--ctp-overlay0);
    margin: 0 0 0.5rem;
  }

  .reload-plugins-btn {
    margin-top: 0.25rem;
  }
</style>
