import { describe, expect, it } from 'vitest'
import { DEFAULT_INGESTION_GUIDE } from './ingestion-guide'
import { DEFAULT_SYSTEM_PROMPT } from './assistant-prompts'
import { FLOW_ROLES, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS, labelValues } from './model/label-vocabulary'
import { PROMPT_PLACEHOLDERS } from './prompt-placeholders'

describe('the ingestion guide', () => {
  it('documents every accepted value of every label dimension', () => {
    for (const value of [FLOW_ROLES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS, RECURRENCES].flatMap(labelValues)) {
      expect(DEFAULT_INGESTION_GUIDE).toContain(`- ${value}:`)
    }
  })

  it('leaves the placement labels to the app, as placeholders rather than a stale list', () => {
    expect(DEFAULT_INGESTION_GUIDE).toContain(PROMPT_PLACEHOLDERS.sections)
    expect(DEFAULT_INGESTION_GUIDE).toContain(PROMPT_PLACEHOLDERS.subsections)
  })

  it('states the two boundaries the assistant may not cross', () => {
    expect(DEFAULT_INGESTION_GUIDE).toContain('the *user* presses')
    expect(DEFAULT_INGESTION_GUIDE).toContain("the user's click alone")
    expect(DEFAULT_INGESTION_GUIDE).toContain('Never apply a blanket rule to IOF, Pix')
  })

  it('is reachable: the system prompt tells the model to fetch it before helping', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('read_ingestion_guide')
    expect(DEFAULT_SYSTEM_PROMPT).toContain('including a plain request for help with it')
  })
})
