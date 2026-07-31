import { create } from 'zustand'
import { sections } from '@/sections'

interface UiState {
  activeSectionId: string
  /** sectionId -> last-selected itemId. Fallback-to-first-item logic lives in consumers. */
  activeItemBySection: Record<string, string>
  secondaryBarCollapsed: boolean
  selectSection: (id: string) => void
  selectItem: (sectionId: string, itemId: string) => void
  setSecondaryBarCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeSectionId: sections[0].id,
  activeItemBySection: {},
  secondaryBarCollapsed: false,

  selectSection: (id) => {
    const { activeSectionId, secondaryBarCollapsed } = get()
    if (id === activeSectionId) {
      set({ secondaryBarCollapsed: !secondaryBarCollapsed })
    } else {
      set({ activeSectionId: id, secondaryBarCollapsed: false })
    }
  },

  selectItem: (sectionId, itemId) =>
    set((s) => ({ activeItemBySection: { ...s.activeItemBySection, [sectionId]: itemId } })),

  setSecondaryBarCollapsed: (collapsed) => set({ secondaryBarCollapsed: collapsed }),
}))
