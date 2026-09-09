import { describe, expect, it } from 'vitest'
import { asTransaction, investmentRowsOf, isCashReserve, isFixedIncome, isVariableIncome } from './investment-rows'
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
  it('works one unit out from the money and the units, since a table holds only those two', () => {
    expect(asTransaction(row({ amount: 10, value: -500 }))).toMatchObject({ quantity: 10, price: 50 })
  })

  it('drops the sign, because a position is a size and not a direction', () => {
    expect(asTransaction(row({ amount: -3 }))).toMatchObject({ quantity: 3 })
  })

  it('reads the kind from whatever the row was labelled, in either language', () => {
    expect(asTransaction(row({ subcategory: 'Compra' })).type).toBe('buy')
    expect(asTransaction(row({ subcategory: 'Venda' })).type).toBe('sell')
    expect(asTransaction(row({ subcategory: 'Dividendos' })).type).toBe('income')
    expect(asTransaction(row({ subcategory: 'rendimento' })).type).toBe('income')
    // An investment row that says nothing is a purchase, which is what one usually is.
    expect(asTransaction(row()).type).toBe('buy')
  })

  it('names the position after the thing itself, and then after what kind it is', () => {
    expect(asTransaction(row({ subcategory: 'tesouro - IPCA+' })).asset).toBe('tesouro - IPCA+')
    expect(asTransaction(row({ subcategory: '', class: 'renda fixa' })).asset).toBe('renda fixa')
    expect(asTransaction(row({ subcategory: '', category: 'tesouro' })).asset).toBe('tesouro')
  })
})

describe('which rows are investments at all', () => {
  it('is the ones on the investments screen, marked rows excluded like everywhere else', () => {
    const rows = [row(), row({ id: 2, screen: 'spending' }), row({ id: 3, markedForElimination: true })]

    expect(investmentRowsOf(rows).map((entry) => entry.id)).toEqual([1])
  })

  it('reads the kind of thing off the class label, or off the category it was once put in', () => {
    expect(isFixedIncome(row({ class: 'Renda Fixa' }))).toBe(true)
    expect(isVariableIncome(row({ class: 'renda variável' }))).toBe(true)
    expect(isCashReserve(row({ category: 'cash' }))).toBe(true)
    expect(isFixedIncome(row())).toBe(false)
    expect(isVariableIncome(row())).toBe(false)
  })

  it('does not read the subcategory, which names the thing rather than its kind', () => {
    // A paper called "tesouro - reserva 2029" is fixed income, not the cash reserve.
    expect(isCashReserve(row({ class: 'fixed income', subcategory: 'tesouro - reserva 2029' }))).toBe(false)
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
