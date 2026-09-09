import { describe, expect, it } from 'vitest'
import { monthsThroughToday, spendingMonths, spendingSoFar, trailingAverages } from './spending-months'
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

  /** The fifth of August 2026: the months in the rows above are the calendar's, not the data's. */
  const today = new Date(2026, 7, 5)

  it('accumulates each month separately and lines the days up', () => {
    const days = spendingSoFar(rows, today)

    expect(days[0]).toEqual({ day: 1, thisMonth: 60, lastMonth: 100 })
    expect(days[4]).toEqual({ day: 5, thisMonth: 100, lastMonth: 100 })
  })

  it('stops on today, rather than on the last row or at the end of the month', () => {
    const days = spendingSoFar(rows, today)

    // The line runs to the fifth because it is the fifth, whether or not anything was
    // spent since — and the month it is compared with is the whole of the one before.
    expect(days[4].thisMonth).toBe(100)
    expect(days[5].thisMonth).toBeNull()
    expect(days[19].lastMonth).toBe(200)
  })

  it('reads the month it is, not the last month the data reaches', () => {
    // Two months after the last row: nothing has been spent this month, and that is the
    // answer rather than a reason to present July as the month in progress.
    const days = spendingSoFar(rows, new Date(2026, 9, 4))

    expect(days).toEqual([])
    expect(spendingSoFar(rows, new Date(2026, 8, 4))[3]).toEqual({ day: 4, thisMonth: 0, lastMonth: 60 })
  })

  it('says nothing when there is nothing', () => {
    expect(spendingSoFar([], today)).toEqual([])
  })
})

describe('the months a spending screen runs over', () => {
  const months = spendingMonths([
    row({ value: -100, date: Date.UTC(2026, 5, 2) }),
    row({ value: -200, date: Date.UTC(2026, 6, 2) }),
  ], () => false)

  it('runs through to the calendar month, which may have nothing in it', () => {
    expect(monthsThroughToday(months, new Date(2026, 7, 5)).at(-1)).toEqual({
      month: '2026-08', spent: 0, committed: 0, entries: 0,
    })
  })

  it('leaves the list alone when the current month is already the last of it', () => {
    expect(monthsThroughToday(months, new Date(2026, 6, 30))).toHaveLength(2)
  })

  it('averages each month with the three before it, so one expensive month is a slope', () => {
    // June 100, July 200, August nothing: each point is its own four-month window / 4,
    // so the empty month lowers the level rather than dropping the line to zero.
    expect(trailingAverages(monthsThroughToday(months, new Date(2026, 7, 5)))).toEqual([0, 25, 75, 75])
  })
})
