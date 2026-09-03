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

  it('rests on the icon strip, with no remembered items', () => {
    const state = useUiStore.getState()
    expect(state.activeSectionId).toBe(sections[0].id)
    expect(state.secondaryBarMode).toBe('icons')
    expect(state.activeItemBySection).toEqual({})
  })

  it('selecting a different section switches to it and returns the bar to icons', () => {
    useUiStore.getState().setSecondaryBarMode('expanded')
    const otherSectionId = sections[1].id

    useUiStore.getState().selectSection(otherSectionId)

    expect(useUiStore.getState().activeSectionId).toBe(otherSectionId)
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')
  })

  it('re-selecting the active section toggles the labels on and off, with no hidden state', () => {
    const activeId = useUiStore.getState().activeSectionId

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().activeSectionId).toBe(activeId)
    expect(useUiStore.getState().secondaryBarMode).toBe('expanded')

    useUiStore.getState().selectSection(activeId)
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')
  })

  it('collapses the labels again once a different item has been chosen with them', () => {
    const [section] = sections
    useUiStore.getState().selectItem(section.id, 'item-a')
    useUiStore.getState().setSecondaryBarMode('expanded')

    useUiStore.getState().selectItem(section.id, 'item-b')

    expect(useUiStore.getState().secondaryBarMode).toBe('icons')
    expect(useUiStore.getState().activeItemBySection).toEqual({ [section.id]: 'item-b' })
  })

  it('shows the labels when the item already open is clicked again, and hides them on the next click', () => {
    const [section] = sections
    useUiStore.getState().selectItem(section.id, 'item-a')

    useUiStore.getState().selectItem(section.id, 'item-a')
    expect(useUiStore.getState().secondaryBarMode).toBe('expanded')

    useUiStore.getState().selectItem(section.id, 'item-a')
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')
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

describe('the secondary bar as a flyout', () => {
  it('toggles from inside the bar as well as from the activity icon', () => {
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')

    useUiStore.getState().toggleSecondaryBar()
    expect(useUiStore.getState().secondaryBarMode).toBe('expanded')

    useUiStore.getState().toggleSecondaryBar()
    expect(useUiStore.getState().secondaryBarMode).toBe('icons')
  })
})
