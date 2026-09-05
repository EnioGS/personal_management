import { describe, expect, it } from 'vitest'
import { asTransaction, investmentRowsOf, isFixedIncome, isVariableIncome } from './investment-rows'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { ConfirmedRow } from './types'

function row(overrides: Partial<StoredRow<ConfirmedRow>> = {}): StoredRow<ConfirmedRow> {
  return {
    id: 1,
    createdAt: 0,
    rowId: 'r1',
    section: 'finances',
    screen: 'investments',
    confirmedAt: 0,
    date: Date.UTC(2026, 0, 5),
    value: -500,
    observations: '{}',
    category: 'outros',
    subcategory: 'outros',
    ...overrides,
  }
}

describe('reading a confirmed row as a portfolio transaction', () => {
  it('recovers the unit price from the amount when the file only gave a total', () => {
    expect(asTransaction(row({ amount: 10, price: undefined, value: -500 }))).toMatchObject({ quantity: 10, price: 50 })
  })

  it('drops the sign, because a position is a size and not a direction', () => {
    expect(asTransaction(row({ amount: -3, price: -20 }))).toMatchObject({ quantity: 3, price: 20 })
  })

  it('reads the kind from whatever the file called it, in either language', () => {
    expect(asTransaction(row({ investmentType: 'Compra' })).type).toBe('buy')
    expect(asTransaction(row({ investmentType: 'Venda' })).type).toBe('sell')
    expect(asTransaction(row({ investmentType: 'Dividendos' })).type).toBe('income')
    expect(asTransaction(row({ subcategory: 'rendimento' })).type).toBe('income')
    // An investment row that says nothing is a purchase, which is what one usually is.
    expect(asTransaction(row()).type).toBe('buy')
  })

  it('takes the asset from the row, falling back to what the row is about', () => {
    expect(asTransaction(row({ asset: 'PETR4' })).asset).toBe('PETR4')
    expect(asTransaction(row({ asset: undefined, category: 'tesouro' })).asset).toBe('tesouro')
  })
})

describe('which rows are investments at all', () => {
  it('is the ones on the investments screen, marked rows excluded like everywhere else', () => {
    const rows = [row(), row({ id: 2, screen: 'spending' }), row({ id: 3, markedForElimination: true })]

    expect(investmentRowsOf(rows).map((entry) => entry.id)).toEqual([1])
  })

  it('reads the class from the words the file used, and calls neither when it says neither', () => {
    expect(isFixedIncome(row({ investmentClass: 'Renda Fixa' }))).toBe(true)
    expect(isVariableIncome(row({ investmentClass: 'renda variável' }))).toBe(true)
    expect(isFixedIncome(row())).toBe(false)
    expect(isVariableIncome(row())).toBe(false)
  })
})

describe('a row labelled with its class', () => {
  it('is not read as a payout because "fixed income" contains the word', () => {
    expect(asTransaction(row({ category: 'fixed income', subcategory: 'tesouro - IPCA+' })).type).toBe('buy')
  })

  it('still reads the kind when the row says one', () => {
    expect(asTransaction(row({ category: 'fixed income', subcategory: 'resgate' })).type).toBe('sell')
    expect(asTransaction(row({ category: 'fixed income', subcategory: 'juros' })).type).toBe('income')
  })
})
