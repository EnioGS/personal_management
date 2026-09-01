import { beforeEach, describe, expect, it } from 'vitest'
import { sections } from '@/sections'
import { DEFAULT_SECTION_ID } from '@/sections/default-section'
import { useUiStore } from './ui-store'

const initialState = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initialState, true)
})

describe('ui-store', () => {
  it('opens on the first registered section — the standalone default must not drift', () => {
    expect(DEFAULT_SECTION_ID).toBe(sections[0].id)
  })

  it('defaults to the first registered section, expanded, with no remembered items', () => {
    const state = useUiStore.getState()
    expect(state.activeSectionId).toBe(sections[0].id)
    expect(state.secondaryBarMode).toBe('expanded')
    expect(state.activeItemBySection).toEqual({})
  })

  it('selecting a different section switches to it and force-expands the secondary bar', () => {
    useUiStore.getState().setSecondaryBarMode('hidden')
    const otherSectionId = sections[1].id

    useUiStore.getState().selectSection(otherSectionId)

    expect(useUiStore.getState().activeSectionId).toBe(otherSectionId)
    expect(useUiStore.getState().secondaryBarMode).toBe('expanded')
  })

  it('re-selecting the active section cycles expanded -> icons -> hidden -> expanded', () => {
    const activeId = useUiStore.getState().activeSectionId

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().activeSectionId).toBe(activeId)
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().secondaryBarMode).toBe('hidden')

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().secondaryBarMode).toBe('expanded')
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
