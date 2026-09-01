import { create } from 'zustand'
import { CONFIG_KEY, DEFAULT_MODEL, DEV_API_KEY, useAssistantConfigStore } from '@/lib/assistant-config'
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
  /** The exact model string sent to OpenRouter for this reply — absent on error bubbles. */
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
 * Ephemeral for now — messages live in memory only, cleared on refresh.
 * Persisted history is a later step, not part of this one.
 */
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
      const config = useAssistantConfigStore.getState().items.find((item) => item.key === CONFIG_KEY)
      const apiKey = config?.apiKey || DEV_API_KEY
      if (!apiKey) {
        throw new Error('No API key configured — add one in Settings → Assistant.')
      }

      const promptRow = useAssistantPromptsStore.getState().items.find((item) => item.key === SYSTEM_PROMPT_KEY)
      const systemPrompt = promptRow?.content ?? DEFAULT_SYSTEM_PROMPT
      const attachments = get().attachments

      const apiMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt + formatAttachmentsForPrompt(attachments) },
        ...[...priorMessages, userMessage].map((m) => ({ role: m.role, content: m.content }) as OpenRouterMessage),
      ]

      // Tool-call/tool-result messages built inside this call are local to it and never
      // join `messages` — each new user message starts a fresh tool loop from the visible
      // text history + system prompt + current attachments. A follow-up question about the
      // same file re-calls the (cheap, local) tool rather than the model "remembering" —
      // a deliberate v1 simplification.
      const modelUsed = config?.model || DEFAULT_MODEL
      const replyText = await runConversation({
        apiKey,
        model: modelUsed,
        messages: apiMessages,
        context: { attachments },
        tools: toolsForRequest(),
        onStatus: (status) => set({ status }),
      })
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: replyText,
        model: modelUsed,
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
