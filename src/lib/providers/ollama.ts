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
  models: [
    { id: 'qwen3:8b', label: 'Qwen3 8B' },
    { id: 'qwen3:32b', label: 'Qwen3 32B' },
    { id: 'llama3.3:70b', label: 'Llama 3.3 70B' },
    { id: 'deepseek-r1:14b', label: 'DeepSeek R1 14B' },
    { id: 'codellama:13b', label: 'Code Llama 13B' },
  ],
};
