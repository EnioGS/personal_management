import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT_KEY } from '@/lib/assistant-prompts'
import { INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { toolRegistry } from '@/lib/tools/registry'
import { brokenPlaceholders, promptRegistry, requiredPlaceholders } from './registry'

describe('what a profile may change', () => {
  const entries = promptRegistry()

  it('is every word the app puts in front of the model, gathered from the code', () => {
    const keys = entries.map((entry) => entry.key)

    expect(keys).toContain(SYSTEM_PROMPT_KEY)
    expect(keys).toContain(INGESTION_GUIDE_KEY)
    // Every tool, so one added tomorrow is editable the same day without a list to update.
    for (const tool of toolRegistry) expect(keys).toContain(`tool.${tool.name}`)
    expect(entries.filter((entry) => entry.section === 'Tool sets').length).toBeGreaterThan(0)
  })

  it('reads placeholders off the default rather than off a list', () => {
    const guide = entries.find((entry) => entry.key === INGESTION_GUIDE_KEY)!

    expect(requiredPlaceholders(guide.fallback)).toEqual(['[PLACEHOLDER_FOR_SECTIONS]', '[PLACEHOLDER_FOR_SCREENS]'])
    expect(brokenPlaceholders(guide, 'a guide with [PLACEHOLDER_FOR_SECTIONS] only')).toEqual(['[PLACEHOLDER_FOR_SCREENS]'])
    expect(brokenPlaceholders(guide, guide.fallback)).toEqual([])
  })

  it('asks nothing of a prompt that never had a placeholder', () => {
    const tool = entries.find((entry) => entry.section === 'Tools')!

    expect(brokenPlaceholders(tool, 'anything at all')).toEqual([])
  })
})
