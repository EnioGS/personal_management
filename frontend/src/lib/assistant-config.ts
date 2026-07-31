import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import { assistantConfigTable } from './assistant-config-db'

export interface AssistantConfig {
  key: string
  apiKey: string
  model: string
}

export const CONFIG_KEY = 'default'
export const DEFAULT_MODEL = 'openai/gpt-4o-mini'

export const useAssistantConfigStore = createEncryptedListStore<AssistantConfig>(assistantConfigTable)
