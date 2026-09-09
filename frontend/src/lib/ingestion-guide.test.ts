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

  it('states the order of the work: placement, then columns, then the sign', () => {
    const guide = DEFAULT_INGESTION_GUIDE
    // Placement decides what a file may assign, so it cannot come second.
    expect(guide.indexOf('Label the sections')).toBeLessThan(guide.indexOf('Assign the columns'))
    expect(guide.indexOf('Assign the columns')).toBeLessThan(guide.indexOf('Only then decide the sign'))
  })

  it('tells the model to look at the destination tables rather than trust a recorded convention', () => {
    // Read without its line breaks: what matters is that the guide says these things,
    // not where the paragraph happens to wrap.
    const guide = DEFAULT_INGESTION_GUIDE.replace(/\s+/g, ' ')

    expect(guide).toContain('sample the destination tables')
    expect(guide).toContain('a shortcut, not evidence')
    expect(guide).toContain('ask the user')
  })

  it('stays short: it is fetched whole, and everything the tools already say is waste here', () => {
    // Measured as sent: a placeholder is replaced by the live list before the guide goes
    // anywhere, so its own spelling is not part of what the model is charged for.
    const asSent = DEFAULT_INGESTION_GUIDE.replace(/\[PLACEHOLDER_FOR_[A-Z0-9_]+\]/g, '')
    // Roughly four characters to a token. Raised from 1,400 when SQL replaced eight tools:
    // the guide says what their schemas used to, once per conversation instead of on every
    // request, so the accounting across a whole exchange moved sharply the other way.
    expect(asSent.length / 4).toBeLessThan(1450)
  })

  it('states the discipline that outlived the restriction: a correction is a pair', () => {
    // The sentence wraps in the guide's own text, so the claim is checked without its
    // line break: what matters is that the guide says it, not how it is set.
    const guide = DEFAULT_INGESTION_GUIDE.replace(/\s+/g, ' ')

    expect(guide).toContain('the same row_id')
    expect(guide).toContain('marking the old one')
    // Deleting is no longer the user's alone, and the guide says what replaced that.
    expect(guide).toContain('undoable whole')
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

  it('states the rule that never bends, and leaves the rest to the guide', () => {
    const prompt = DEFAULT_SYSTEM_PROMPT.replace(/\s+/g, ' ')

    // What survived opening SQL up: a correction is a pair, because that is about what a
    // change looks like on screen rather than about what the assistant is trusted with.
    expect(prompt).toContain('same row_id')
    expect(prompt).toContain('not an edit in place')
    expect(prompt).toContain('undoable whole')
    expect(prompt).toContain('read_ingestion_guide')
  })

  it('is short, because everything it repeats is fetched on demand and paid for twice', () => {
    // Roughly four characters to a token: a prompt sent with every single request has to
    // earn its length, and the guide already says what this used to say.
    //
    // Raised from 360 for the one instruction that cannot be fetched on demand. A model
    // that does not know it keeps a record has no reason to read the document that would
    // have told it, and the whole of what it learns is lost with the conversation — which
    // is what happened: an hour of explanation, sixteen rows relabelled, nothing written
    // down. Everything else here can wait to be looked up; this cannot.
    expect(DEFAULT_SYSTEM_PROMPT.length / 4).toBeLessThan(440)
  })
})
