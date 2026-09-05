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
  it('splits the holdings by the class each row names', () => {
    expect(holdingsSplit([
      investment({ value: -3000, investmentClass: 'Renda Fixa' }),
      investment({ value: -2000, investmentClass: 'renda variável' }),
      investment({ value: -800, investmentClass: 'Reserva de emergência' }),
    ])).toEqual({ fixedIncome: 3000, variableIncome: 2000, cash: 800, unclassified: 0 })
  })

  it('takes the cash reserve from the rows, never from what is left in the accounts', () => {
    expect(holdingsSplit([investment({ value: -3000, investmentClass: 'Renda Fixa' })]).cash).toBe(0)
  })

  it('nets a redemption against what is held in that class', () => {
    const split = holdingsSplit([
      investment({ value: -3000, investmentClass: 'Renda Fixa' }),
      investment({ value: 1200, investmentClass: 'Renda Fixa' }),
    ])
    expect(split).toMatchObject({ fixedIncome: 1800 })
  })

  it('keeps money nobody classed apart, rather than guessing at it', () => {
    expect(holdingsSplit([investment({ value: -500 })])).toMatchObject({ unclassified: 500 })
  })

  it('draws nothing negative: a class redeemed to nothing is nothing', () => {
    expect(holdingsSplit([
      investment({ value: -1000, investmentClass: 'Renda Fixa' }),
      investment({ value: 1000, investmentClass: 'Renda Fixa' }),
    ])).toEqual({ fixedIncome: 0, variableIncome: 0, cash: 0, unclassified: 0 })
  })
})
