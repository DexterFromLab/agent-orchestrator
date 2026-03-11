// Provider Registry — singleton registry of available providers (Svelte 5 runes)

import type { ProviderId, ProviderMeta } from './types';

const providers = $state(new Map<ProviderId, ProviderMeta>());

export function registerProvider(meta: ProviderMeta): void {
  providers.set(meta.id, meta);
}

export function getProvider(id: ProviderId): ProviderMeta | undefined {
  return providers.get(id);
}

export function getProviders(): ProviderMeta[] {
  return Array.from(providers.values());
}

export function getDefaultProviderId(): ProviderId {
  return 'claude';
}

/** Check if a specific provider is registered */
export function hasProvider(id: ProviderId): boolean {
  return providers.has(id);
}
