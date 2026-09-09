import { beforeEach, describe, expect, it } from 'vitest'
import { adoptDraft, readDraft, writeDraft } from './draft'

beforeEach(() => localStorage.clear())

describe('a message typed and not sent', () => {
  it('comes back where it was left', () => {
    writeDraft(7, 'half a question about')

    expect(readDraft(7)).toBe('half a question about')
  })

  it('belongs to its own conversation, not to whichever is open', () => {
    writeDraft(7, 'for seven')
    writeDraft(8, 'for eight')

    expect(readDraft(7)).toBe('for seven')
    expect(readDraft(8)).toBe('for eight')
    expect(readDraft(null)).toBe('')
  })

  it('is forgotten once the box is emptied, rather than kept as nothing', () => {
    writeDraft(7, 'something')
    writeDraft(7, '   ')

    expect(readDraft(7)).toBe('')
    expect(localStorage.getItem('chatDrafts')).toBe('{}')
  })

  it('moves onto the conversation it became, having been typed before there was one', () => {
    writeDraft(null, 'the first thing said')

    adoptDraft(12)

    expect(readDraft(12)).toBe('the first thing said')
    expect(readDraft(null)).toBe('')
  })

  it('reads as empty when what was stored is unreadable', () => {
    localStorage.setItem('chatDrafts', 'not json')

    expect(readDraft(7)).toBe('')
  })
})
