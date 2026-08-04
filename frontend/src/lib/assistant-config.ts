import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import { assistantConfigTable } from './assistant-config-db'

export interface AssistantConfig {
  key: string
  apiKey: string
  model: string
}

export const CONFIG_KEY = 'default'
export const DEFAULT_MODEL = 'openai/gpt-5.5'

/**
 * Dev-only convenience, read from .env's VITE_OPENROUTER_API_KEY: lets a saved
 * vault key be skipped locally instead of pasting one in every fresh vault.
 * The `import.meta.env.DEV` check is not just a runtime guard — Vite dead-code
 * -eliminates this whole branch (and the literal env value) out of production
 * builds entirely, so it can never end up in the bundle this app auto-deploys
 * to GitHub Pages on every push (see adr/0012).
 */
export const DEV_API_KEY: string | null =
  import.meta.env.DEV && import.meta.env.VITE_OPENROUTER_API_KEY
    ? import.meta.env.VITE_OPENROUTER_API_KEY.trim() || null
    : null

export const useAssistantConfigStore = createEncryptedListStore<AssistantConfig>(assistantConfigTable)
