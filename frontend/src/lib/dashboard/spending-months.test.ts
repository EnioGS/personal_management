import { describe, expect, it } from 'vitest'
import { spendingMonths, spendingSoFar } from './spending-months'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

function row(over: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: crypto.randomUUID(), section: 'finances', screen: 'spending', date: Date.UTC(2026, 7, 3),
    value: -100, category: 'mercado', subcategory: '', observations: '{}', description: 'MERCADO',
    sourceFilename: 'banco.csv', ...over,
  }
}

describe('spending month by month', () => {
  it('counts what left, and how much of it was already decided', () => {
    const months = spendingMonths([
      row({ value: -100, date: Date.UTC(2026, 6, 2) }),
      row({ value: -30, date: Date.UTC(2026, 6, 5), subcategory: 'assinatura' }),
      row({ value: -80, date: Date.UTC(2026, 7, 1) }),
      // Money arriving is not spending, whatever screen it is on.
      row({ value: 500, date: Date.UTC(2026, 7, 2) }),
    ], (entry) => entry.subcategory === 'assinatura')

    expect(months).toEqual([
      { month: '2026-07', spent: 130, committed: 30, entries: 2 },
      { month: '2026-08', spent: 80, committed: 0, entries: 1 },
    ])
  })
})

describe('this month against the last, day for day', () => {
  const rows = [
    row({ value: -100, date: Date.UTC(2026, 6, 1) }),
    row({ value: -100, date: Date.UTC(2026, 6, 20) }),
    row({ value: -60, date: Date.UTC(2026, 7, 1) }),
    row({ value: -40, date: Date.UTC(2026, 7, 5) }),
  ]

  it('accumulates each month separately and lines the days up', () => {
    const days = spendingSoFar(rows)

    expect(days[0]).toEqual({ day: 1, thisMonth: 60, lastMonth: 100 })
    expect(days[4]).toEqual({ day: 5, thisMonth: 100, lastMonth: 100 })
  })

  it('stops the current month where it has got to, rather than drawing it flat', () => {
    const days = spendingSoFar(rows)

    // Nothing was spent after the fifth, and the month has not ended.
    expect(days[5].thisMonth).toBeNull()
    expect(days[19].lastMonth).toBe(200)
  })

  it('says nothing when there is nothing', () => {
    expect(spendingSoFar([])).toEqual([])
  })
})
