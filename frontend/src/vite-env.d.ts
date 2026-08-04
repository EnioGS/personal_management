/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only convenience — see lib/assistant-config.ts. Never read outside import.meta.env.DEV checks. */
  readonly VITE_OPENROUTER_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
