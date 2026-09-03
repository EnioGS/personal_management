import { describe, expect, it } from 'vitest'
import { FLOW_ROLES, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS, labelValues } from './label-vocabulary'

describe('label vocabulary', () => {
  it('keeps recurrence able to say "ends on a known date" and "not judged yet" separately', () => {
    expect(labelValues(RECURRENCES)).toEqual(['oneOff', 'recurring', 'installment', 'undecided'])
  })

  it('accepts a value however the user capitalised it, and rejects anything else', () => {
    expect(matchLabelValue(FLOW_ROLES, ' Inflow ')).toBe('inflow')
    expect(matchLabelValue(RECURRENCES, 'whatever')).toBeUndefined()
    expect(matchLabelValue(SETTLEMENT_CHANNELS, '')).toBeUndefined()
  })

  it('explains every value it accepts, so the guide can never drift from the code', () => {
    for (const option of [...FLOW_ROLES, ...SETTLEMENT_CHANNELS, ...SPENDING_TREATMENTS, ...RECURRENCES]) {
      expect(option.meaning.length).toBeGreaterThan(20)
    }
  })
})
