// Provider abstraction types — defines the interface for multi-provider agent support

export type ProviderId = 'claude' | 'codex' | 'ollama';

/** What a provider can do — UI gates features on these flags */
export interface ProviderCapabilities {
  hasProfiles: boolean;
  hasSkills: boolean;
  hasModelSelection: boolean;
  hasSandbox: boolean;
  supportsSubagents: boolean;
  supportsCost: boolean;
  supportsResume: boolean;
}

/** Static metadata about a provider */
export interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  capabilities: ProviderCapabilities;
  /** Name of the sidecar runner file (e.g. 'claude-runner.mjs') */
  sidecarRunner: string;
  /** Default model identifier, if applicable */
  defaultModel?: string;
  /** Available model presets for dropdown selection */
  models?: { id: string; label: string }[];
}

/** Per-provider configuration (stored in settings) */
export interface ProviderSettings {
  enabled: boolean;
  defaultModel?: string;
  /** Provider-specific config blob */
  config: Record<string, unknown>;
}
