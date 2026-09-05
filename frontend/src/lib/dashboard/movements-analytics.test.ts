import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import {
  accountsWithCards,
  incomeByCategory,
  largestMovements,
  monthlyAverages,
  monthlyFlow,
  monthlySpread,
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
      { month: '2026-07', incoming: 3000, outgoing: 1200, net: 1800 },
      { month: '2026-08', incoming: 0, outgoing: 80, net: -80 },
    ])
  })

  it('averages a month over the months there are, not over the calendar', () => {
    const flow = monthlyFlow([entry({ value: 1000 }), entry({ date: Date.UTC(2026, 7, 1), value: -500 })])

    expect(monthlyAverages(flow)).toEqual({ incoming: 500, outgoing: 250, net: 250 })
    expect(monthlyAverages([])).toEqual({ incoming: 0, outgoing: 0, net: 0 })
  })
})

describe('where money came from', () => {
  it('counts only what arrived', () => {
    expect(incomeByCategory([
      entry({ category: 'salário', value: 5000 }),
      entry({ category: 'mercado', value: -300 }),
    ])).toEqual([{ key: 'salário', label: 'salário', value: 5000 }])
  })
})

describe('the months an average hides', () => {
  const flow = monthlyFlow([
    entry({ date: Date.UTC(2026, 5, 1), value: 1000 }),
    entry({ date: Date.UTC(2026, 6, 1), value: -400 }),
    entry({ date: Date.UTC(2026, 7, 1), value: 200 }),
  ])

  it('reports the middle month, the best and the worst', () => {
    expect(monthlySpread(flow)).toMatchObject({ median: 200, best: { month: '2026-06' }, worst: { month: '2026-07' } })
  })

  it('averages the two middle months when there is no middle one', () => {
    expect(monthlySpread(flow.slice(0, 2)).median).toBe(300)
  })

  it('says nothing about no months at all', () => {
    expect(monthlySpread([])).toEqual({ median: 0, best: null, worst: null })
  })
})

describe('the rows worth looking at first', () => {
  it('are the largest either way, since a big arrival is as notable as a big departure', () => {
    const rows = [entry({ value: -50 }), entry({ value: 4000 }), entry({ value: -900 })]

    expect(largestMovements(rows, 2).map((row) => row.value)).toEqual([4000, -900])
  })
})

describe('accountsWithCards', () => {
  const movements = [
    entry({ account: 'Nubank', value: 5000 }),
    entry({ account: 'Nubank', value: -1500 }),
    entry({ account: 'Itaú', value: 200 }),
  ]
  const spending = [
    entry({ screen: 'spending', account: 'Nubank', card: 'Nubank Ultravioleta', value: -400 }),
    entry({ screen: 'spending', account: 'Nubank', card: 'Nubank Ultravioleta', value: -100 }),
    entry({ screen: 'spending', account: 'Nubank', card: 'Nubank Mastercard', value: -900 }),
    // A card row with money coming back is a refund; it subtracts from what the card took.
    entry({ screen: 'spending', account: 'Nubank', card: 'Nubank Mastercard', value: 50 }),
  ]

  it('puts each account balance above the cards billed to it', () => {
    expect(accountsWithCards(movements, spending)).toEqual([
      {
        key: 'Nubank',
        label: 'Nubank',
        value: 3500,
        children: [
          { key: 'Nubank Mastercard', label: 'Nubank Mastercard', value: 900 },
          { key: 'Nubank Ultravioleta', label: 'Nubank Ultravioleta', value: 500 },
        ],
      },
      { key: 'Itaú', label: 'Itaú', value: 200, children: [] },
    ])
  })

  it('keeps an account nobody spent on, since a balance answers by itself', () => {
    expect(accountsWithCards([entry({ account: 'Itaú', value: 200 })], [])).toEqual([
      { key: 'Itaú', label: 'Itaú', value: 200, children: [] },
    ])
  })

  it('names an account nobody labelled rather than dropping its money', () => {
    expect(accountsWithCards([entry({ account: undefined, value: 200 })], [])[0].label).toBe('—')
  })

  it('shows an account that only ever appears on a card row', () => {
    const groups = accountsWithCards([], [entry({ screen: 'spending', account: 'Itaú', card: 'Itaú Click', value: -70 })])
    expect(groups).toEqual([{ key: 'Itaú', label: 'Itaú', value: 0, children: [{ key: 'Itaú Click', label: 'Itaú Click', value: 70 }] }])
  })
})
