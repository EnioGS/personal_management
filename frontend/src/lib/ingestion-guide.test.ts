import { describe, expect, it } from 'vitest'
import { DEFAULT_INGESTION_GUIDE } from './ingestion-guide'
import { DEFAULT_SYSTEM_PROMPT } from './assistant-prompts'
import { PROMPT_PLACEHOLDERS } from './prompt-placeholders'

describe('the ingestion guide', () => {
  it('names the four labels and nothing that was removed with the seven', () => {
    for (const label of ['Sections', 'Screens', 'Category', 'Subcategory']) {
      expect(DEFAULT_INGESTION_GUIDE).toContain(label)
    }
    for (const gone of ['flow role', 'settlement channel', 'spending treatment', 'recurrence label']) {
      expect(DEFAULT_INGESTION_GUIDE.toLowerCase()).not.toContain(gone)
    }
  })

  it('leaves the placement labels to the app, as placeholders rather than a stale list', () => {
    expect(DEFAULT_INGESTION_GUIDE).toContain(PROMPT_PLACEHOLDERS.sections)
    expect(DEFAULT_INGESTION_GUIDE).toContain(PROMPT_PLACEHOLDERS.screens)
  })

  it('states the order of the work, ending with the sign', () => {
    const guide = DEFAULT_INGESTION_GUIDE
    expect(guide.indexOf('Assign the columns')).toBeLessThan(guide.indexOf('Label the sections'))
    expect(guide.indexOf('Label the sections')).toBeLessThan(guide.indexOf('Label the screens'))
    expect(guide.indexOf('Label the screens')).toBeLessThan(guide.indexOf('Only then decide the sign'))
  })

  it('tells the model to look at the destination tables rather than trust a recorded convention', () => {
    expect(DEFAULT_INGESTION_GUIDE).toContain('sample the destination tables')
    expect(DEFAULT_INGESTION_GUIDE).toContain('a shortcut, not evidence')
    expect(DEFAULT_INGESTION_GUIDE).toContain('ask the user')
  })

  it('states the one asymmetry between the user and the assistant', () => {
    // The sentence wraps in the guide's own text, so the claim is checked without its
    // line break: what matters is that the guide says it, not how it is set.
    expect(DEFAULT_INGESTION_GUIDE.replace(/\s+/g, ' ')).toContain("Deleting is the user's alone")
    expect(DEFAULT_INGESTION_GUIDE).toContain('Never edit a confirmed row in place')
  })

  it('is reachable: the system prompt tells the model to fetch it before helping', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('read_ingestion_guide')
    expect(DEFAULT_SYSTEM_PROMPT).toContain('including a plain request for help with it')
  })
})

describe('the system prompt', () => {
  it('mentions no label the model can no longer set', () => {
    for (const gone of ['flow role', 'settlement channel', 'spending treatment', 'recurrence']) {
      expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).not.toContain(gone)
    }
  })

  it('states the two rules that must never bend, and leaves the rest to the guide', () => {
    const prompt = DEFAULT_SYSTEM_PROMPT.replace(/\s+/g, ' ')

    expect(prompt).toContain('Never edit a confirmed row in place')
    expect(prompt).toContain('only the user deletes anything')
    expect(prompt).toContain('read_ingestion_guide')
  })

  it('is short, because everything it repeats is fetched on demand and paid for twice', () => {
    // Roughly four characters to a token: a prompt sent with every single request has to
    // earn its length, and the guide already says what this used to say.
    expect(DEFAULT_SYSTEM_PROMPT.length / 4).toBeLessThan(320)
  })
})
