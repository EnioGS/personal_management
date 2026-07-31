import { create } from 'zustand'

interface ChatPanelState {
  isOpen: boolean
  /** True when an assistant message arrived while the panel wasn't being looked at. */
  hasUnread: boolean
  open: () => void
  close: () => void
  toggle: () => void
  markUnread: () => void
  /** Any interaction with the chat surface (click, drag) clears the unread indicator. */
  markInteracted: () => void
}

export const useChatPanelStore = create<ChatPanelState>((set) => ({
  isOpen: false,
  hasUnread: false,
  open: () => set({ isOpen: true, hasUnread: false }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => (s.isOpen ? { isOpen: false } : { isOpen: true, hasUnread: false })),
  markUnread: () => set({ hasUnread: true }),
  markInteracted: () => set({ hasUnread: false }),
}))
