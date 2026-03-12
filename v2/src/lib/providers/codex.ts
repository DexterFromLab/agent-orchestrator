// Codex Provider — metadata and capabilities for OpenAI Codex CLI

import type { ProviderMeta } from './types';

export const CODEX_PROVIDER: ProviderMeta = {
  id: 'codex',
  name: 'Codex CLI',
  description: 'OpenAI Codex CLI agent via SDK',
  capabilities: {
    hasProfiles: false,
    hasSkills: false,
    hasModelSelection: true,
    hasSandbox: true,
    supportsSubagents: false,
    supportsCost: false,
    supportsResume: true,
  },
  sidecarRunner: 'codex-runner.mjs',
  defaultModel: 'gpt-5.4',
  models: [
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
};
