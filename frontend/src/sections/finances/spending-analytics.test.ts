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
    value: -100,
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
    const spending = entry({ value: -120 })
    expect(outgoingSpending([
      spending,
      entry({ screen: 'overview', value: -120 }),
      entry({ screen: 'investments', value: -20 }),
    ])).toEqual([spending])
  })

  it('groups spending into sorted monthly totals, reported as what left', () => {
    expect(spendingByMonth([
      entry({ date: Date.UTC(2026, 7, 1), value: -80 }),
      entry({ date: Date.UTC(2026, 6, 2), value: -20 }),
      entry({ date: Date.UTC(2026, 6, 1), value: -30 }),
    ])).toEqual([
      { month: '2026-07', amount: 50 },
      { month: '2026-08', amount: 80 },
    ])
  })

  it('nets a refund against the month it lands in, rather than hiding it', () => {
    expect(spendingByMonth([
      entry({ date: Date.UTC(2026, 6, 1), value: -80 }),
      entry({ date: Date.UTC(2026, 6, 9), value: 30 }),
    ])).toEqual([{ month: '2026-07', amount: 50 }])
  })

  it('compares the latest month to the preceding month and sorts by absolute movement', () => {
    expect(categorySpendChanges([
      entry({ date: Date.UTC(2026, 6, 1), category: 'Food', value: -40 }),
      entry({ date: Date.UTC(2026, 7, 1), category: 'Food', value: -100 }),
      entry({ date: Date.UTC(2026, 6, 2), category: 'Travel', value: -200 }),
      entry({ date: Date.UTC(2026, 7, 2), category: 'Books', value: -50 }),
    ])).toEqual([
      { category: 'Travel', increased: 0, decreased: 200 },
      { category: 'Food', increased: 60, decreased: 0 },
      { category: 'Books', increased: 50, decreased: 0 },
    ])
  })

  it('ranks descriptions by occurrence, then by total', () => {
    expect(frequentDescriptions([
      entry({ description: 'Market', value: -20 }),
      entry({ description: 'Market', value: -30 }),
      entry({ description: '', category: 'Transport', value: -100 }),
      entry({ description: 'Taxi', value: -150 }),
    ])).toEqual([
      { label: 'Market', count: 2, total: 50 },
      { label: 'Taxi', count: 1, total: 150 },
      { label: 'Transport', count: 1, total: 100 },
    ])
  })

  it('averages categories over all selected months and compares the latest quarter', () => {
    const rows = [
      entry({ category: 'Food', value: -100, date: Date.UTC(2026, 0, 1) }),
      entry({ category: 'Food', value: -300, date: Date.UTC(2026, 3, 1) }),
      entry({ category: 'Travel', value: -400, date: Date.UTC(2026, 3, 2) }),
      entry({ category: 'Food', value: 50, date: Date.UTC(2026, 3, 3) }),
      entry({ screen: 'overview', category: 'Not spending', value: -900, date: Date.UTC(2026, 3, 4) }),
    ]

    expect(averageSpendByCategory(rows, ['2026-01', '2026-02', '2026-03', '2026-04'])).toMatchObject([
      { key: 'Food', label: 'Food', value: 87.5, comparison: 1.8571428571428572 },
      { key: 'Travel', label: 'Travel', value: 100, comparison: 3 },
    ])
  })

  it('breaks each category into the subcategories under it, biggest first', () => {
    const rows = [
      entry({ category: 'Food', subcategory: 'restaurant', value: -300, date: Date.UTC(2026, 0, 1) }),
      entry({ category: 'Food', subcategory: 'market', value: -100, date: Date.UTC(2026, 0, 2) }),
      entry({ category: 'Food', subcategory: 'restaurant', value: -100, date: Date.UTC(2026, 0, 3) }),
      // Nothing said what this one was for; it is still food, and still has to land somewhere.
      entry({ category: 'Food', subcategory: '', value: -40, date: Date.UTC(2026, 0, 4) }),
    ]

    const [food] = averageSpendByCategory(rows, ['2026-01', '2026-02'])
    expect(food.value).toBe(270)
    expect(food.children?.map((child) => [child.label, child.value])).toEqual([
      ['restaurant', 200],
      ['market', 50],
      ['—', 20],
    ])
  })
})

describe('the line that settles the card bill', () => {
  const rows = [
    entry({ category: 'food', value: -100, date: Date.UTC(2026, 0, 1) }),
    // The credit that pays the statement off: the same event as the bank's own payment.
    entry({ category: 'transfer', description: 'Pagamento recebido - 3.373,68', value: 3373.68, date: Date.UTC(2026, 0, 2) }),
    // A real refund on a real purchase, which does belong here.
    entry({ category: 'food', description: 'Estorno de "Mercado"', value: 30, date: Date.UTC(2026, 0, 3) }),
  ]

  it('is not spending, and does not bring its label into the categories', () => {
    expect(averageSpendByCategory(rows, ['2026-01']).map((category) => [category.label, category.value])).toEqual([['food', 70]])
  })

  it('is kept out of the rows the spending screens count', () => {
    expect(outgoingSpending(rows)).toHaveLength(2)
  })
})

describe('a purchase paid straight from the bank', () => {
  it('counts on Spending as well as Movements, because it was confirmed onto both', () => {
    const pix = entry({
      description: 'Transferência enviada pelo Pix - MERCADO SAO JORGE',
      category: 'Supermercado',
      value: -284.9,
    })

    expect(outgoingSpending([pix])).toEqual([pix])
    expect(spendingByMonth(outgoingSpending([pix]))[0].amount).toBe(284.9)
  })
})
