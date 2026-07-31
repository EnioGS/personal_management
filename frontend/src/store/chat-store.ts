import { create } from 'zustand'
import { CONFIG_KEY, DEFAULT_MODEL, useAssistantConfigStore } from '@/lib/assistant-config'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY, useAssistantPromptsStore } from '@/lib/assistant-prompts'
import { sendChatCompletion, type OpenRouterMessage } from '@/lib/openrouter'
import { useVaultStore } from '@/store/vault-store'
import { useChatPanelStore } from './chat-panel-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isSending: boolean
  sendMessage: (text: string) => Promise<void>
}

/**
 * Ephemeral for now — messages live in memory only, cleared on refresh.
 * Persisted history is a later step, not part of this one.
 */
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isSending: false,

  sendMessage: async (text) => {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const priorMessages = get().messages
    set({ messages: [...priorMessages, userMessage], isSending: true })

    try {
      if (!useVaultStore.getState().passphrase) {
        throw new Error('Unlock your vault (Vault → Get Started) before chatting.')
      }

      const config = useAssistantConfigStore.getState().items.find((item) => item.key === CONFIG_KEY)
      if (!config?.apiKey) {
        throw new Error('No API key configured — add one in Settings → Assistant.')
      }

      const promptRow = useAssistantPromptsStore.getState().items.find((item) => item.key === SYSTEM_PROMPT_KEY)
      const systemPrompt = promptRow?.content ?? DEFAULT_SYSTEM_PROMPT

      const apiMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        ...[...priorMessages, userMessage].map((m) => ({ role: m.role, content: m.content }) as OpenRouterMessage),
      ]

      const replyText = await sendChatCompletion(config.apiKey, config.model || DEFAULT_MODEL, apiMessages)
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: replyText }
      set({ messages: [...get().messages, assistantMessage], isSending: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong talking to the assistant.'
      const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: message, isError: true }
      set({ messages: [...get().messages, errorMessage], isSending: false })
    }

    if (!useChatPanelStore.getState().isOpen) useChatPanelStore.getState().markUnread()
  },
}))
