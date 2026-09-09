import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { averageSpendByCategory, categoryVsAverage, frequentDescriptions, outgoingSpending, recentlyNewSpending, spendingByMonth } from './spending-analytics'

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

  it("puts a category's recent rate against its own long-run rate, sorted by the gap", () => {
    // Four months of data ending 1 Aug; the one-month window is the last thirty days of it.
    const rows = [
      entry({ date: Date.UTC(2026, 4, 1), category: 'Food', value: -100 }),
      entry({ date: Date.UTC(2026, 5, 1), category: 'Food', value: -100 }),
      entry({ date: Date.UTC(2026, 6, 1), category: 'Food', value: -100 }),
      entry({ date: Date.UTC(2026, 7, 1), category: 'Food', value: -400 }),
      entry({ date: Date.UTC(2026, 4, 2), category: 'Books', value: -40 }),
    ]

    // Food: 400 in the last thirty days against 700/4 = 175 a month across the data.
    // Books: nothing recent, against 10 a month — a category gone quiet, said as such.
    expect(categoryVsAverage(rows, 1)).toEqual([
      { category: 'Food', change: 225 },
      { category: 'Books', change: -10 },
    ])
  })

  it('reads a longer window as a rate, so three months of it is comparable with one', () => {
    const rows = [
      entry({ date: Date.UTC(2026, 5, 1), category: 'Food', value: -300 }),
      entry({ date: Date.UTC(2026, 6, 1), category: 'Food', value: -300 }),
      entry({ date: Date.UTC(2026, 7, 1), category: 'Food', value: -300 }),
    ]

    // Ninety days back from 1 Aug takes all three months: 900/3 against 900/3.
    expect(categoryVsAverage(rows, 3)).toEqual([])
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

  it('leaves out a category that gave more back than it took', () => {
    const givingBack = [
      entry({ category: 'food', value: -100, date: Date.UTC(2026, 0, 1) }),
      entry({ category: 'transfer', description: 'Ajuste a crédito', value: 40, date: Date.UTC(2026, 0, 2) }),
    ]
    expect(averageSpendByCategory(givingBack, ['2026-01']).map((category) => category.label)).toEqual(['food'])
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

  it('counts what a month bought that it was not buying before, and only that', () => {
    const rows = [
      entry({ date: Date.UTC(2026, 5, 3), description: 'Mercado', value: -100 }),
      entry({ date: Date.UTC(2026, 6, 3), description: 'Mercado', value: -100 }),
      entry({ date: Date.UTC(2026, 7, 3), description: 'Mercado', value: -100 }),
      entry({ date: Date.UTC(2026, 7, 4), description: 'Some New Subscription', value: -40 }),
      entry({ date: Date.UTC(2026, 7, 5), description: 'A Restaurant', value: -60 }),
    ]

    // August: the market has been bought for months, the other two have not.
    expect(recentlyNewSpending(rows, new Date(2026, 7, 20))).toMatchObject({ total: 100, count: 2, monthTotal: 200 })
  })

  it('says a month bought nothing new when it bought nothing new', () => {
    const rows = [
      entry({ date: Date.UTC(2026, 6, 3), description: 'Mercado', value: -100 }),
      entry({ date: Date.UTC(2026, 7, 3), description: 'Mercado', value: -100 }),
    ]

    expect(recentlyNewSpending(rows, new Date(2026, 7, 20))).toMatchObject({ total: 0, count: 0 })
  })
})