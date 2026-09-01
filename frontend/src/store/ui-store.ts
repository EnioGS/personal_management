import { create } from 'zustand'
import { DEFAULT_SECTION_ID } from '@/sections/default-section'

/**
 * How much of the secondary bar is showing. Clicking the active section's
 * activity-bar icon cycles through these in order (see selectSection).
 */
export type SecondaryBarMode = 'expanded' | 'icons' | 'hidden'

const MODE_CYCLE: Record<SecondaryBarMode, SecondaryBarMode> = {
  expanded: 'icons',
  icons: 'hidden',
  hidden: 'expanded',
}

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
}

export const useUiStore = create<UiState>((set, get) => ({
  activeSectionId: DEFAULT_SECTION_ID,
  activeItemBySection: {},
  activeTableByWorkspace: {},
  secondaryBarMode: 'expanded',

  selectSection: (id) => {
    const { activeSectionId, secondaryBarMode } = get()
    if (id === activeSectionId) {
      set({ secondaryBarMode: MODE_CYCLE[secondaryBarMode] })
    } else {
      set({ activeSectionId: id, secondaryBarMode: 'expanded' })
    }
  },

  selectItem: (sectionId, itemId) =>
    set((s) => ({ activeItemBySection: { ...s.activeItemBySection, [sectionId]: itemId } })),

  selectTable: (workspaceId, tableId) =>
    set((s) => ({ activeTableByWorkspace: { ...s.activeTableByWorkspace, [workspaceId]: tableId } })),

  setSecondaryBarMode: (mode) => set({ secondaryBarMode: mode }),
}))
