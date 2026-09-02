import { describe, expect, it } from 'vitest'
import { resolveFilterRange, type DashboardFilters } from './dashboard-filters'

function filters(overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  return {
    preset: 'thisYear',
    customFrom: '',
    customTo: '',
    accountIds: [],
    tableIds: [],
    cardIds: [],
    categories: [],
    ...overrides,
  }
}

describe('resolveFilterRange', () => {
  it('resolves a preset without touching the custom fields', () => {
    const range = resolveFilterRange(filters({ preset: 'last12Months' }))
    expect(range.to).toBeGreaterThan(range.from)
  })

  it('resolves a custom range from its two date inputs, inclusive of the end date', () => {
    const range = resolveFilterRange(filters({ preset: 'custom', customFrom: '2026-01-01', customTo: '2026-01-31' }))

    expect(new Date(range.from).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(new Date(range.to).toISOString()).toBe('2026-01-31T23:59:59.999Z')
  })

  it('falls back to an unbounded side when a custom field is empty rather than matching nothing', () => {
    const openStart = resolveFilterRange(filters({ preset: 'custom', customFrom: '', customTo: '2026-01-31' }))
    expect(openStart.from).toBe(-Infinity)

    const openEnd = resolveFilterRange(filters({ preset: 'custom', customFrom: '2026-01-01', customTo: '' }))
    expect(openEnd.to).toBe(Infinity)
  })
})
