import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { averageSpendByCategory, categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'

/** Amounts are signed the way the app means them, so a spending row is negative. */
function entry(overrides: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: 'row',
    section: 'finances',
    screen: 'spending',
    date: Date.UTC(2026, 6, 1),
    amount: -100,
    category: 'Food',
    subcategory: 'outros',
    observations: '{"source_filename":"nubank.csv"}',
    sourceFilename: 'nubank.csv',
    description: 'Market',
    ...overrides,
  }
}

describe('spending analytics', () => {
  it('keeps rows confirmed onto a spending screen and drops rows confirmed elsewhere', () => {
    const spending = entry({ amount: -120 })
    expect(outgoingSpending([
      spending,
      entry({ screen: 'overview', amount: -120 }),
      entry({ screen: 'investments', amount: -20 }),
    ])).toEqual([spending])
  })

  it('groups spending into sorted monthly totals, reported as what left', () => {
    expect(spendingByMonth([
      entry({ date: Date.UTC(2026, 7, 1), amount: -80 }),
      entry({ date: Date.UTC(2026, 6, 2), amount: -20 }),
      entry({ date: Date.UTC(2026, 6, 1), amount: -30 }),
    ])).toEqual([
      { month: '2026-07', amount: 50 },
      { month: '2026-08', amount: 80 },
    ])
  })

  it('nets a refund against the month it lands in, rather than hiding it', () => {
    expect(spendingByMonth([
      entry({ date: Date.UTC(2026, 6, 1), amount: -80 }),
      entry({ date: Date.UTC(2026, 6, 9), amount: 30 }),
    ])).toEqual([{ month: '2026-07', amount: 50 }])
  })

  it('compares the latest month to the preceding month and sorts by absolute movement', () => {
    expect(categorySpendChanges([
      entry({ date: Date.UTC(2026, 6, 1), category: 'Food', amount: -40 }),
      entry({ date: Date.UTC(2026, 7, 1), category: 'Food', amount: -100 }),
      entry({ date: Date.UTC(2026, 6, 2), category: 'Travel', amount: -200 }),
      entry({ date: Date.UTC(2026, 7, 2), category: 'Books', amount: -50 }),
    ])).toEqual([
      { category: 'Travel', increased: 0, decreased: 200 },
      { category: 'Food', increased: 60, decreased: 0 },
      { category: 'Books', increased: 50, decreased: 0 },
    ])
  })

  it('ranks descriptions by occurrence, then by total', () => {
    expect(frequentDescriptions([
      entry({ description: 'Market', amount: -20 }),
      entry({ description: 'Market', amount: -30 }),
      entry({ description: '', category: 'Transport', amount: -100 }),
      entry({ description: 'Taxi', amount: -150 }),
    ])).toEqual([
      { label: 'Market', count: 2, total: 50 },
      { label: 'Taxi', count: 1, total: 150 },
      { label: 'Transport', count: 1, total: 100 },
    ])
  })

  it('averages categories over all selected months and compares the latest quarter', () => {
    const rows = [
      entry({ category: 'Food', amount: -100, date: Date.UTC(2026, 0, 1) }),
      entry({ category: 'Food', amount: -300, date: Date.UTC(2026, 3, 1) }),
      entry({ category: 'Travel', amount: -400, date: Date.UTC(2026, 3, 2) }),
      entry({ category: 'Food', amount: 50, date: Date.UTC(2026, 3, 3) }),
      entry({ screen: 'overview', category: 'Not spending', amount: -900, date: Date.UTC(2026, 3, 4) }),
    ]

    expect(averageSpendByCategory(rows, ['2026-01', '2026-02', '2026-03', '2026-04'])).toEqual([
      { key: 'Food', label: 'Food', value: 87.5, comparison: 1.8571428571428572 },
      { key: 'Travel', label: 'Travel', value: 100, comparison: 3 },
    ])
  })
})

describe('a purchase paid straight from the bank', () => {
  it('counts on Spending as well as Movements, because it was confirmed onto both', () => {
    const pix = entry({
      description: 'Transferência enviada pelo Pix - MERCADO SAO JORGE',
      category: 'Supermercado',
      amount: -284.9,
    })

    expect(outgoingSpending([pix])).toEqual([pix])
    expect(spendingByMonth(outgoingSpending([pix]))[0].amount).toBe(284.9)
  })
})
