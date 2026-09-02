import { describe, expect, it } from 'vitest'
import {
  bucketByMonth,
  foldTopCategories,
  formatMonthLabel,
  groupByKey,
  runningBalance,
  runningPositionOverTime,
} from './aggregations'
import type { Transaction } from './current-value'

describe('bucketByMonth', () => {
  it('sums values within the same month and sorts chronologically', () => {
    const rows = [
      { date: Date.parse('2026-02-10'), amount: 10 },
      { date: Date.parse('2026-01-05'), amount: 20 },
      { date: Date.parse('2026-01-20'), amount: 5 },
    ]

    expect(bucketByMonth(rows, 'date', 'amount')).toEqual([
      { month: '2026-01', total: 25 },
      { month: '2026-02', total: 10 },
    ])
  })
})

describe('groupByKey', () => {
  it('sums values grouped by a label key', () => {
    const rows = [
      { category: 'Groceries', amount: 10 },
      { category: 'Bills', amount: 30 },
      { category: 'Groceries', amount: 5 },
    ]

    expect(groupByKey(rows, 'category', 'amount')).toEqual([
      { label: 'Groceries', value: 15 },
      { label: 'Bills', value: 30 },
    ])
  })
})

describe('foldTopCategories', () => {
  it('leaves the data untouched when it fits within the cap', () => {
    const data = [
      { label: 'A', value: 10 },
      { label: 'B', value: 5 },
    ]
    expect(foldTopCategories(data, 7, 'Other')).toEqual(data)
  })

  it('folds everything past the cap into one "other" bucket, by value not appearance order', () => {
    const data = [
      { label: 'A', value: 1 },
      { label: 'B', value: 50 },
      { label: 'C', value: 2 },
      { label: 'D', value: 3 },
    ]

    const result = foldTopCategories(data, 2, 'Other')

    expect(result).toEqual([
      { label: 'B', value: 50 },
      { label: 'D', value: 3 },
      { label: 'Other', value: 1 + 2 }, // A + C, the two smallest
    ])
  })

  it('is exactly at the cap: no "other" bucket appears', () => {
    const data = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ]
    expect(foldTopCategories(data, 2, 'Other')).toHaveLength(2)
  })
})

describe('runningPositionOverTime', () => {
  it('produces a step function that only changes at transaction events', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'buy', quantity: 5, price: 6 },
      { date: 3, asset: 'XYZ', type: 'buy', quantity: 2, price: 100 },
    ]

    expect(runningPositionOverTime(transactions)).toEqual([
      { date: 1, value: 50 }, // 10 * 5
      { date: 2, value: 90 }, // 15 * 6 (last price updates for the whole position)
      { date: 3, value: 290 }, // 90 + 2*100
    ])
  })
})

describe('formatMonthLabel', () => {
  it('formats a "YYYY-MM" bucket key as a localized month/year label', () => {
    expect(formatMonthLabel('2026-01')).toContain('2026')
  })
})

describe('runningBalance', () => {
  it('merges income and spending chronologically into a running balance', () => {
    const income = [{ date: 1, amount: 100 }]
    const spending = [
      { date: 2, amount: 30 },
      { date: 3, amount: 20 },
    ]

    expect(runningBalance(income, spending)).toEqual([
      { date: 1, balance: 100 },
      { date: 2, balance: 70 },
      { date: 3, balance: 50 },
    ])
  })
})
