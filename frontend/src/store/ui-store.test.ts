import { beforeEach, describe, expect, it } from 'vitest'
import { sections } from '@/sections'
import { useUiStore } from './ui-store'

const initialState = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initialState, true)
})

describe('ui-store', () => {
  it('defaults to the first registered section, expanded, with no remembered items', () => {
    const state = useUiStore.getState()
    expect(state.activeSectionId).toBe(sections[0].id)
    expect(state.secondaryBarCollapsed).toBe(false)
    expect(state.activeItemBySection).toEqual({})
  })

  it('selecting a different section switches to it and force-expands the secondary bar', () => {
    useUiStore.getState().setSecondaryBarCollapsed(true)
    const otherSectionId = sections[1].id

    useUiStore.getState().selectSection(otherSectionId)

    expect(useUiStore.getState().activeSectionId).toBe(otherSectionId)
    expect(useUiStore.getState().secondaryBarCollapsed).toBe(false)
  })

  it('re-selecting the already-active section toggles the secondary bar instead of switching', () => {
    const activeId = useUiStore.getState().activeSectionId

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().activeSectionId).toBe(activeId)
    expect(useUiStore.getState().secondaryBarCollapsed).toBe(true)

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().secondaryBarCollapsed).toBe(false)
  })

  it('remembers the last-selected item per section without clobbering other sections', () => {
    const [sectionA, sectionB] = sections

    useUiStore.getState().selectItem(sectionA.id, 'item-a')
    useUiStore.getState().selectItem(sectionB.id, 'item-b')

    expect(useUiStore.getState().activeItemBySection).toEqual({
      [sectionA.id]: 'item-a',
      [sectionB.id]: 'item-b',
    })
  })
})
