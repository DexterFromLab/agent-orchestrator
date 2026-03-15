import { invoke } from '@tauri-apps/api/core';

/** Store a secret in the system keyring. */
export async function storeSecret(key: string, value: string): Promise<void> {
  return invoke('secrets_store', { key, value });
}

/** Retrieve a secret from the system keyring. Returns null if not found. */
export async function getSecret(key: string): Promise<string | null> {
  return invoke('secrets_get', { key });
}

/** Delete a secret from the system keyring. */
export async function deleteSecret(key: string): Promise<void> {
  return invoke('secrets_delete', { key });
}

/** List keys that have been stored in the keyring. */
export async function listSecrets(): Promise<string[]> {
  return invoke('secrets_list');
}

/** Check if the system keyring is available. */
export async function hasKeyring(): Promise<boolean> {
  return invoke('secrets_has_keyring');
}

/** Get the list of known/recognized secret key identifiers. */
export async function knownSecretKeys(): Promise<string[]> {
  return invoke('secrets_known_keys');
}

/** Human-readable labels for known secret keys. */
export const SECRET_KEY_LABELS: Record<string, string> = {
  anthropic_api_key: 'Anthropic API Key',
  openai_api_key: 'OpenAI API Key',
  openrouter_api_key: 'OpenRouter API Key',
  github_token: 'GitHub Token',
  relay_token: 'Relay Token',
};
