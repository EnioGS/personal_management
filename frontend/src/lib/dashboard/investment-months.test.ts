import { describe, expect, it } from 'vitest'
import { investmentMonths, isProceeds } from './investment-months'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

function row(over: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: crypto.randomUUID(), section: 'finances', screen: 'investments', date: Date.UTC(2026, 0, 5),
    value: -1000, category: '', subcategory: '', observations: '{}', description: '',
    sourceFilename: 'corretora.csv', ...over,
  }
}

describe('holdings month by month', () => {
  it('accumulates each class and carries it through months with nothing in them', () => {
    const months = investmentMonths([
      row({ class: 'fixed income', value: -1000, date: Date.UTC(2026, 0, 5) }),
      row({ class: 'cash reserve', value: 300, date: Date.UTC(2026, 0, 6) }),
      row({ class: 'fixed income', value: 400, date: Date.UTC(2026, 2, 1) }),
    ])

    expect(months.map((month) => month.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    // February had nothing in it, and a holding held through it is still held.
    expect(months[1]).toMatchObject({ fixedIncome: 1000, cash: 300, held: 1300 })
    expect(months[2]).toMatchObject({ fixedIncome: 600, held: 900 })
  })

  it('counts what the holdings paid out, in the month they paid it', () => {
    const months = investmentMonths([
      row({ class: 'cash reserve', subcategory: 'juros', value: 66.49, date: Date.UTC(2026, 0, 20) }),
      row({ class: 'cash reserve', value: 300, date: Date.UTC(2026, 1, 1) }),
    ])

    expect(months[0].received).toBe(66.49)
    expect(months[1].received).toBe(0)
  })

  it('reads a payout by what the row calls it, money leaving never being one', () => {
    expect(isProceeds(row({ subcategory: 'juros', value: 10 }))).toBe(true)
    expect(isProceeds(row({ observations: '{"type":"dividend"}', value: 10 }))).toBe(true)
    expect(isProceeds(row({ subcategory: 'juros', value: -10 }))).toBe(false)
    expect(isProceeds(row({ subcategory: 'aplicacao', value: 10 }))).toBe(false)
  })

  it('says nothing about nothing', () => {
    expect(investmentMonths([])).toEqual([])
  })
})
