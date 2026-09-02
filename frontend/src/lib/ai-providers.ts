export type ApiProvider = 'openrouter' | 'openai'

interface ProviderMeta {
  id: ApiProvider
  label: string
}

export const API_PROVIDERS: ProviderMeta[] = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
]

export function providerLabel(id: ApiProvider): string {
  return API_PROVIDERS.find((p) => p.id === id)?.label ?? id
}

/**
 * Detects the provider straight from an API key's own prefix — no network call
 * needed, so the UI can classify (and reject) a key as soon as it's pasted.
 * OpenRouter's keys ("sk-or-...") are themselves "sk-"-prefixed, so that check
 * must run before the more permissive OpenAI one.
 */
export function detectApiProvider(rawKey: string): ApiProvider | null {
  const key = rawKey.trim()
  if (/^sk-or-/.test(key)) return 'openrouter'
  if (/^sk-/.test(key)) return 'openai'
  return null
}
