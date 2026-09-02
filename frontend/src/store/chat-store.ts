import { create } from 'zustand'
import { requestChatMessage } from '@/lib/openrouter'
import { requestOpenAiChatMessage } from '@/lib/openai-client'
import { DEV_API_KEY, useAssistantConfigStore, type AssistantConfig } from '@/lib/assistant-config'
import { defaultModelForProvider } from '@/lib/assistant-models'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY, useAssistantPromptsStore } from '@/lib/assistant-prompts'
import { formatAttachmentsForPrompt, type ChatAttachment } from '@/lib/chat-attachments'
import type { OpenRouterMessage } from '@/lib/openrouter'
import { toolsForRequest } from '@/lib/tools/registry'
import { runConversation, type ConversationStatus } from '@/lib/tools/run-conversation'
import { useChatPanelStore } from './chat-panel-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  model?: string
}

export type ChatStatus = { type: 'idle' } | ConversationStatus

interface ChatState {
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  isSending: boolean
  status: ChatStatus
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  addAttachment: (attachment: ChatAttachment) => void
  removeAttachment: (id: string) => void
  pushError: (text: string) => void
}

/**
 * The connection the chat sends requests to: whichever saved connection is
 * marked active, or — if none has been configured yet — the dev-only
 * OpenRouter key from .env, so a fresh browser profile still works locally.
 */
function activeConnection(): AssistantConfig | null {
  const active = useAssistantConfigStore.getState().items.find((item) => item.isActive)
  if (active) return active
  if (DEV_API_KEY) return { provider: 'openrouter', apiKey: DEV_API_KEY, model: defaultModelForProvider('openrouter'), isActive: true }
  return null
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  attachments: [],
  isSending: false,
  status: { type: 'idle' },

  sendMessage: async (text) => {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const priorMessages = get().messages
    set({ messages: [...priorMessages, userMessage], isSending: true, status: { type: 'waiting' } })

    try {
      const connection = activeConnection()
      if (!connection) {
        throw new Error('No API key configured — add one in Settings → Assistant.')
      }

      const promptRow = useAssistantPromptsStore.getState().items.find((item) => item.key === SYSTEM_PROMPT_KEY)
      const systemPrompt = promptRow?.content ?? DEFAULT_SYSTEM_PROMPT
      const attachments = get().attachments

      const apiMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt + formatAttachmentsForPrompt(attachments) },
        ...[...priorMessages, userMessage].map((m) => ({ role: m.role, content: m.content }) as OpenRouterMessage),
      ]

      const requestFn = connection.provider === 'openai' ? requestOpenAiChatMessage : requestChatMessage
      const replyText = await runConversation({
        apiKey: connection.apiKey,
        model: connection.model,
        messages: apiMessages,
        context: { attachments },
        tools: toolsForRequest(),
        requestFn,
        onStatus: (status) => set({ status }),
      })
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: replyText,
        model: connection.model,
      }
      set({ messages: [...get().messages, assistantMessage], isSending: false, status: { type: 'idle' } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong talking to the assistant.'
      const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: message, isError: true }
      set({ messages: [...get().messages, errorMessage], isSending: false, status: { type: 'idle' } })
    }

    if (useChatPanelStore.getState().panelWidth === 0) useChatPanelStore.getState().markUnread()
  },

  clearMessages: () => set({ messages: [], attachments: [] }),
  addAttachment: (attachment) => set({ attachments: [...get().attachments, attachment] }),
  removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
  pushError: (text) => {
    const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: text, isError: true }
    set({ messages: [...get().messages, errorMessage] })
  },
}))
