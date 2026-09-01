import { create } from 'zustand'

/** Minimum panel width when open. Icon grip is 28px, content needs at least this much space. */
const MIN_PANEL_WIDTH = 200
/** Maximum panel width (roughly 1/2 viewport on desktop). */
const MAX_PANEL_WIDTH = 768
/** Width of the draggable grip on the left of the panel. */
const GRIP_WIDTH = 28

interface ChatPanelState {
  /** Panel width in pixels. 0 = fully closed, shows only the grip. */
  panelWidth: number
  /** True when an assistant message arrived while the panel wasn't being looked at. */
  hasUnread: boolean
  setPanelWidth: (width: number) => void
  togglePanel: () => void
  markUnread: () => void
  /** Any interaction with the chat surface (click, drag) clears the unread indicator. */
  markInteracted: () => void
}

export const useChatPanelStore = create<ChatPanelState>((set, get) => ({
  panelWidth: 0,
  hasUnread: false,
  setPanelWidth: (width) => set({ panelWidth: Math.max(0, Math.min(width, MAX_PANEL_WIDTH)), hasUnread: false }),
  togglePanel: () => {
    const { panelWidth } = get()
    set({ panelWidth: panelWidth > 0 ? 0 : Math.min(500, MAX_PANEL_WIDTH), hasUnread: false })
  },
  markUnread: () => set({ hasUnread: true }),
  markInteracted: () => set({ hasUnread: false }),
}))

export { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, GRIP_WIDTH }
