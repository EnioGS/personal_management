import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'

function entry(overrides: Partial<FilteredEntry>): FilteredEntry {
  return {
    date: Date.UTC(2026, 6, 1),
    amount: 100,
    direction: 'out',
    category: 'Food',
    description: 'Market',
    ...overrides,
    tableId: overrides.tableId ?? 1,
  }
}

describe('spending analytics', () => {
  it('excludes incoming entries and refunds from spending', () => {
    expect(outgoingSpending([
      entry({ amount: 120 }),
      entry({ direction: 'in', amount: 120 }),
      entry({ amount: -20 }),
    ])).toEqual([entry({ amount: 120 })])
  })

  it('groups spending into sorted monthly totals', () => {
    expect(spendingByMonth([
      entry({ date: Date.UTC(2026, 7, 1), amount: 80 }),
      entry({ date: Date.UTC(2026, 6, 2), amount: 20 }),
      entry({ date: Date.UTC(2026, 6, 1), amount: 30 }),
    ])).toEqual([
      { month: '2026-07', amount: 50 },
      { month: '2026-08', amount: 80 },
    ])
  })

  it('compares the latest month to the preceding month and sorts by absolute movement', () => {
    expect(categorySpendChanges([
      entry({ date: Date.UTC(2026, 6, 1), category: 'Food', amount: 40 }),
      entry({ date: Date.UTC(2026, 7, 1), category: 'Food', amount: 100 }),
      entry({ date: Date.UTC(2026, 6, 2), category: 'Travel', amount: 200 }),
      entry({ date: Date.UTC(2026, 7, 2), category: 'Books', amount: 50 }),
    ])).toEqual([
      { category: 'Travel', increased: 0, decreased: 200 },
      { category: 'Food', increased: 60, decreased: 0 },
      { category: 'Books', increased: 50, decreased: 0 },
    ])
  })

  it('ranks descriptions by occurrence, then by total', () => {
    expect(frequentDescriptions([
      entry({ description: 'Market', amount: 20 }),
      entry({ description: 'Market', amount: 30 }),
      entry({ description: '', category: 'Transport', amount: 100 }),
      entry({ description: 'Taxi', amount: 150 }),
    ])).toEqual([
      { label: 'Market', count: 2, total: 50 },
      { label: 'Taxi', count: 1, total: 150 },
      { label: 'Transport', count: 1, total: 100 },
    ])
  })
})
