import { create } from 'zustand'
import { useChatPanelStore } from './chat-panel-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
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
    set({ messages: [...get().messages, userMessage], isSending: true })

    // Placeholder response — replaced by a real API call in the next step.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: 'placeholder answer' }
    set({ messages: [...get().messages, assistantMessage], isSending: false })

    if (!useChatPanelStore.getState().isOpen) useChatPanelStore.getState().markUnread()
  },
}))
