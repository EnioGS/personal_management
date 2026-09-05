import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import {
  balanceByAccount,
  incomeByCategory,
  largestMovements,
  monthlyAverages,
  monthlyFlow,
  monthsOfRunway,
  savingsRate,
  spendByCard,
} from './movements-analytics'

function entry(overrides: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: crypto.randomUUID(),
    section: 'finances',
    screen: 'movements',
    date: Date.UTC(2026, 6, 1),
    value: -100,
    category: 'mercado',
    subcategory: '',
    observations: '{}',
    description: 'MERCADO',
    sourceFilename: 'banco.csv',
    account: 'Nubank',
    ...overrides,
  }
}

describe('what a month brought in and took out', () => {
  it('keeps the two apart, since netting hides how much moved', () => {
    expect(monthlyFlow([
      entry({ date: Date.UTC(2026, 6, 1), value: 3000 }),
      entry({ date: Date.UTC(2026, 6, 2), value: -1200 }),
      entry({ date: Date.UTC(2026, 7, 1), value: -80 }),
    ])).toEqual([
      { month: '2026-07', incoming: 3000, outgoing: 1200 },
      { month: '2026-08', incoming: 0, outgoing: 80 },
    ])
  })

  it('averages a month over the months there are, not over the calendar', () => {
    const flow = monthlyFlow([entry({ value: 1000 }), entry({ date: Date.UTC(2026, 7, 1), value: -500 })])

    expect(monthlyAverages(flow)).toEqual({ incoming: 500, outgoing: 250, net: 250 })
    expect(monthlyAverages([])).toEqual({ incoming: 0, outgoing: 0, net: 0 })
  })
})

describe('what was kept of what arrived', () => {
  it('is the share of income that did not leave again', () => {
    expect(savingsRate([entry({ value: 1000 }), entry({ value: -250 })])).toBeCloseTo(0.75)
  })

  it('is nothing at all when nothing arrived, rather than zero', () => {
    expect(savingsRate([entry({ value: -250 })])).toBeNull()
    expect(savingsRate([])).toBeNull()
  })
})

describe('how long the capital lasts', () => {
  it('divides it by what a month with spending in it spends', () => {
    expect(monthsOfRunway(3000, [1000, 0, 500])).toBeCloseTo(4)
  })

  it('says nothing when nothing was spent, and never a negative number of months', () => {
    expect(monthsOfRunway(3000, [0, 0])).toBeNull()
    expect(monthsOfRunway(-500, [100])).toBe(0)
  })
})

describe('where the money sits and what it came from', () => {
  it('nets each account, largest first', () => {
    expect(balanceByAccount([
      entry({ account: 'Nubank', value: 1000 }),
      entry({ account: 'Nubank', value: -200 }),
      entry({ account: 'Poupança', value: 3000 }),
      entry({ account: undefined, value: -50 }),
    ])).toEqual([
      { key: 'Poupança', label: 'Poupança', value: 3000 },
      { key: 'Nubank', label: 'Nubank', value: 800 },
      { key: '—', label: '—', value: -50 },
    ])
  })

  it('counts only what arrived when saying where money came from', () => {
    expect(incomeByCategory([
      entry({ category: 'salário', value: 5000 }),
      entry({ category: 'mercado', value: -300 }),
    ])).toEqual([{ key: 'salário', label: 'salário', value: 5000 }])
  })

  it('counts only what left, and only on a card, when saying which card', () => {
    expect(spendByCard([
      entry({ card: 'Nubank Ultravioleta', value: -300 }),
      entry({ card: 'Nubank Ultravioleta', value: -200 }),
      entry({ card: undefined, value: -900 }),
      entry({ card: 'Nubank Ultravioleta', value: 50 }),
    ])).toEqual([{ key: 'Nubank Ultravioleta', label: 'Nubank Ultravioleta', value: 500 }])
  })
})

describe('the rows worth looking at first', () => {
  it('are the largest either way, since a big arrival is as notable as a big departure', () => {
    const rows = [entry({ value: -50 }), entry({ value: 4000 }), entry({ value: -900 })]

    expect(largestMovements(rows, 2).map((row) => row.value)).toEqual([4000, -900])
  })
})
