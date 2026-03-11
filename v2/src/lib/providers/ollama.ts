// Ollama Provider — metadata and capabilities for local Ollama models

import type { ProviderMeta } from './types';

export const OLLAMA_PROVIDER: ProviderMeta = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Local Ollama models via REST API',
  capabilities: {
    hasProfiles: false,
    hasSkills: false,
    hasModelSelection: true,
    hasSandbox: false,
    supportsSubagents: false,
    supportsCost: false,
    supportsResume: false,
  },
  sidecarRunner: 'ollama-runner.mjs',
  defaultModel: 'qwen3:8b',
};
