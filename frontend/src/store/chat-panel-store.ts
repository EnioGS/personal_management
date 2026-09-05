import { create } from 'zustand'

/** Below this, releasing the drag snaps to closed instead of an unusably narrow sliver. */
const MIN_PANEL_WIDTH = 260
/** Maximum panel width (roughly 1/2 viewport on desktop). */
const MAX_PANEL_WIDTH = 768
/** Width of the draggable grip on the left of the panel — always visible, even at width 0. */
const GRIP_WIDTH = 20

interface ChatPanelState {
  /** Content width in pixels, not counting the grip. 0 = closed, showing only the grip. */
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

  // Snaps below MIN_PANEL_WIDTH to fully closed, rather than leaving the panel
  // resting at a sliver too narrow for its own composer/message layout.
  setPanelWidth: (width) => {
    const clamped = Math.max(0, Math.min(width, MAX_PANEL_WIDTH))
    const snapped = clamped < MIN_PANEL_WIDTH ? 0 : clamped
    set({ panelWidth: snapped, hasUnread: false })
  },

  togglePanel: () => {
    const { panelWidth } = get()
    set({ panelWidth: panelWidth > 0 ? 0 : Math.min(500, MAX_PANEL_WIDTH), hasUnread: false })
  },

  markUnread: () => set({ hasUnread: true }),
  markInteracted: () => set({ hasUnread: false }),
}))

export { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, GRIP_WIDTH }
