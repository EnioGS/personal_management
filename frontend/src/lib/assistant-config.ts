import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { ApiProvider } from './ai-providers'
import { assistantConfigTable } from './assistant-config-db'

/** One saved connection per provider — see adr/0027. */
export interface AssistantConfig {
  provider: ApiProvider
  apiKey: string
  model: string
  /** The connection the chat currently sends requests to. Exactly one row is active at a time. */
  isActive: boolean
}

/**
 * Dev-only convenience, read from .env's VITE_OPENROUTER_API_KEY: lets a saved
 * key be skipped locally instead of pasting one in every fresh browser profile.
 * The `import.meta.env.DEV` check is not just a runtime guard — Vite dead-code
 * -eliminates this whole branch (and the literal env value) out of production
 * builds entirely, so it can never end up in the bundle this app auto-deploys
 * to GitHub Pages on every push (see adr/0012).
 */
export const DEV_API_KEY: string | null =
  import.meta.env.DEV && import.meta.env.VITE_OPENROUTER_API_KEY
    ? import.meta.env.VITE_OPENROUTER_API_KEY.trim() || null
    : null

export const useAssistantConfigStore = createLocalListStore<AssistantConfig>(assistantConfigTable)
