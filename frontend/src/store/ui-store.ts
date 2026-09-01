import { create } from 'zustand'
import { sections } from '@/sections'

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
  secondaryBarMode: SecondaryBarMode
  selectSection: (id: string) => void
  selectItem: (sectionId: string, itemId: string) => void
  setSecondaryBarMode: (mode: SecondaryBarMode) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeSectionId: sections[0].id,
  activeItemBySection: {},
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

  setSecondaryBarMode: (mode) => set({ secondaryBarMode: mode }),
}))
