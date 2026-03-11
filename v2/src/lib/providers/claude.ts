// Claude Provider — metadata and capabilities for Claude Code

import type { ProviderMeta } from './types';

export const CLAUDE_PROVIDER: ProviderMeta = {
  id: 'claude',
  name: 'Claude Code',
  description: 'Anthropic Claude Code agent via SDK',
  capabilities: {
    hasProfiles: true,
    hasSkills: true,
    hasModelSelection: true,
    hasSandbox: false,
    supportsSubagents: true,
    supportsCost: true,
    supportsResume: true,
  },
  sidecarRunner: 'claude-runner.mjs',
  defaultModel: 'claude-opus-4-6',
};
