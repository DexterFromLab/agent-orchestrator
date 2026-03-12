// Aider Provider — metadata and capabilities for Aider (OpenRouter / multi-model agent)

import type { ProviderMeta } from './types';

export const AIDER_PROVIDER: ProviderMeta = {
  id: 'aider',
  name: 'Aider',
  description: 'Aider AI coding agent — supports OpenRouter, OpenAI, Anthropic and local models',
  capabilities: {
    hasProfiles: false,
    hasSkills: false,
    hasModelSelection: true,
    hasSandbox: false,
    supportsSubagents: false,
    supportsCost: false,
    supportsResume: false,
  },
  sidecarRunner: 'aider-runner.mjs',
  defaultModel: 'openrouter/anthropic/claude-sonnet-4',
  models: [
    { id: 'openrouter/anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 (OpenRouter)' },
    { id: 'openrouter/anthropic/claude-haiku-4', label: 'Claude Haiku 4 (OpenRouter)' },
    { id: 'openrouter/openai/gpt-4.1', label: 'GPT-4.1 (OpenRouter)' },
    { id: 'openrouter/openai/o3', label: 'o3 (OpenRouter)' },
    { id: 'openrouter/google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (OpenRouter)' },
    { id: 'openrouter/deepseek/deepseek-r1', label: 'DeepSeek R1 (OpenRouter)' },
    { id: 'openrouter/meta-llama/llama-4-maverick', label: 'Llama 4 Maverick (OpenRouter)' },
    { id: 'anthropic/claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5 (direct)' },
    { id: 'o3', label: 'o3 (OpenAI direct)' },
    { id: 'ollama/qwen3:8b', label: 'Qwen3 8B (Ollama)' },
  ],
};
