import { create } from 'zustand'
import { DEFAULT_SECTION_ID } from '@/sections/default-section'

/**
 * How much of the secondary bar is showing. Clicking the active section's
 * activity-bar icon toggles between the two (see selectSection).
 *
 * `icons` is the resting state: the icon strip costs almost nothing horizontally
 * while still letting any item be reached in one click, so labels are what gets
 * asked for, not what has to be dismissed.
 */
export type SecondaryBarMode = 'expanded' | 'icons'

interface UiState {
  activeSectionId: string
  /** sectionId -> last-selected itemId. Fallback-to-first-item logic lives in consumers. */
  activeItemBySection: Record<string, string>
  /** workspaceId -> last-selected table row id, so switching panels comes back where you were. */
  activeTableByWorkspace: Record<string, number>
  secondaryBarMode: SecondaryBarMode
  selectSection: (id: string) => void
  selectItem: (sectionId: string, itemId: string) => void
  selectTable: (workspaceId: string, tableId: number) => void
  setSecondaryBarMode: (mode: SecondaryBarMode) => void
  toggleSecondaryBar: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeSectionId: DEFAULT_SECTION_ID,
  activeItemBySection: {},
  activeTableByWorkspace: {},
  secondaryBarMode: 'icons',

  selectSection: (id) => {
    const { activeSectionId, secondaryBarMode } = get()
    if (id === activeSectionId) {
      set({ secondaryBarMode: secondaryBarMode === 'icons' ? 'expanded' : 'icons' })
    } else {
      set({ activeSectionId: id, secondaryBarMode: 'icons' })
    }
  },

  /**
   * Choosing an item is what the labels were opened for, so the bar gives the width
   * back as soon as that choice is made. Clicking the item that is *already* active
   * asks for the labels instead — the same gesture as re-clicking the section's icon,
   * so nothing needs a button of its own to say "show me the names".
   */
  selectItem: (sectionId, itemId) =>
    set((s) => {
      const reselecting = s.activeItemBySection[sectionId] === itemId
      return {
        activeItemBySection: { ...s.activeItemBySection, [sectionId]: itemId },
        secondaryBarMode: reselecting ? (s.secondaryBarMode === 'icons' ? 'expanded' : 'icons') : 'icons',
      }
    }),

  selectTable: (workspaceId, tableId) =>
    set((s) => ({ activeTableByWorkspace: { ...s.activeTableByWorkspace, [workspaceId]: tableId } })),

  setSecondaryBarMode: (mode) => set({ secondaryBarMode: mode }),

  /** Same toggle as the activity-bar icon, reachable from inside the bar itself. */
  toggleSecondaryBar: () => set((s) => ({ secondaryBarMode: s.secondaryBarMode === 'icons' ? 'expanded' : 'icons' })),
}))
