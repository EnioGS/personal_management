import { describe, expect, it } from 'vitest'
import { holdingsSplit } from './holdings-split'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

function investment(overrides: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: crypto.randomUUID(),
    section: 'finances',
    screen: 'investments',
    date: Date.UTC(2026, 0, 1),
    value: -1000,
    category: '',
    subcategory: '',
    observations: '{}',
    description: 'Aplicação',
    sourceFilename: 'corretora.csv',
    ...overrides,
  }
}

describe('holdingsSplit', () => {
  it('holds what was placed, and calls the rest cash', () => {
    expect(holdingsSplit(10_000, [
      investment({ value: -3000, investmentClass: 'Renda Fixa' }),
      investment({ value: -2000, investmentClass: 'renda variável' }),
    ])).toEqual({ fixedIncome: 3000, variableIncome: 2000, unclassified: 0, cash: 5000 })
  })

  it('nets a redemption against what is held in that class', () => {
    const split = holdingsSplit(10_000, [
      investment({ value: -3000, investmentClass: 'Renda Fixa' }),
      investment({ value: 1200, investmentClass: 'Renda Fixa' }),
    ])
    expect(split).toMatchObject({ fixedIncome: 1800, cash: 8200 })
  })

  it('keeps money nobody classed apart, rather than guessing at it', () => {
    expect(holdingsSplit(5000, [investment({ value: -500 })])).toMatchObject({ unclassified: 500, cash: 4500 })
  })

  it('draws nothing negative: a class redeemed to nothing is nothing, and so is capital below zero', () => {
    expect(holdingsSplit(-6577, [
      investment({ value: -1000, investmentClass: 'Renda Fixa' }),
      investment({ value: 1000, investmentClass: 'Renda Fixa' }),
    ])).toEqual({ fixedIncome: 0, variableIncome: 0, unclassified: 0, cash: 0 })
  })
})
