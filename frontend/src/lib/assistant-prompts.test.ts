import { describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, enableAppendOnlyTableWrites } from './assistant-prompts'

describe('enableAppendOnlyTableWrites', () => {
  it('upgrades the former persisted row restriction without replacing unrelated custom instructions', () => {
    const legacy = 'Keep answers short. You cannot add, edit, correct, delete, or restore table rows, and you cannot change accounts, cards, or other settings. Always mention dates.'
    const upgraded = enableAppendOnlyTableWrites(legacy)

    expect(upgraded).toContain('Finance tables are read-only to you')
    expect(upgraded).toContain('Keep answers short.')
    expect(upgraded).toContain('Always mention dates.')
    expect(upgraded).not.toContain('You cannot add, edit, correct, delete, or restore table rows')
  })

  it('does not change the current default prompt', () => {
    expect(enableAppendOnlyTableWrites(DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT)
  })
})
