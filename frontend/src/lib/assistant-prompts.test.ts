import { describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, enableAppendOnlyTableWrites } from './assistant-prompts'

describe('enableAppendOnlyTableWrites', () => {
  it('upgrades a persisted row restriction without replacing unrelated custom instructions', () => {
    const legacy = 'Keep answers short. You cannot add, edit, correct, delete, or restore table rows, and you cannot change accounts, cards, or other settings. Always mention dates.'
    const upgraded = enableAppendOnlyTableWrites(legacy)

    expect(upgraded).toContain('never edit a row in place')
    expect(upgraded).toContain('Keep answers short.')
    expect(upgraded).toContain('Always mention dates.')
    expect(upgraded).not.toContain('You cannot add, edit, correct, delete, or restore table rows')
  })

  it('also upgrades the read-only sentence that came between, which no longer describes what the model may do', () => {
    const previous = 'Finance tables are read-only to you. Every change to the data — adding a row, correcting one, taking one out — is made in the Data ingestion centre, where a row keeps its raw values and its labels are explicit; you cannot write to a table directly, and you cannot change accounts, cards, or other settings.'
    expect(enableAppendOnlyTableWrites(previous)).not.toContain('read-only to you')
  })

  it('does not change the current default prompt', () => {
    expect(enableAppendOnlyTableWrites(DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
  })
})
