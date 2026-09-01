import { beforeEach, describe, expect, it } from 'vitest'
import { findWritableTable, writableTables } from './writable-tables'

describe('writableTables', () => {
  it('registers exactly the 5 finance/investment tables', () => {
    expect(writableTables.map((t) => t.key)).toEqual([
      'spending',
      'income',
      'variableIncome',
      'fixedIncome',
      'contributions',
    ])
  })

  it("each table's schema keys match its expected columns", () => {
    const spending = findWritableTable('spending')!
    expect(spending.schema.map((c) => c.key)).toEqual(['date', 'category', 'amount', 'note'])

    const contributions = findWritableTable('contributions')!
    expect(contributions.schema.map((c) => c.key)).toEqual(['date', 'destination', 'amount'])

    const variableIncome = findWritableTable('variableIncome')!
    expect(variableIncome.schema.map((c) => c.key)).toEqual(['date', 'asset', 'type', 'quantity', 'price', 'note'])
  })
})

describe('findWritableTable', () => {
  it('returns undefined for an unknown key', () => {
    expect(findWritableTable('does_not_exist')).toBeUndefined()
  })
})

describe('each table exposes items/addItem/addItems/updateItem', () => {
  beforeEach(() => {
  })

  it('every registered table has items/addItem/addItems/updateItem on its store', () => {
    for (const t of writableTables) {
      const state = t.useStore.getState()
      expect(Array.isArray(state.items)).toBe(true)
      expect(typeof state.addItem).toBe('function')
      expect(typeof state.addItems).toBe('function')
      expect(typeof state.updateItem).toBe('function')
    }
  })

  it("spending's addItem resolves the new row's numeric id", async () => {
    const spending = findWritableTable('spending')!
    const id = await spending.useStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 1 })
    expect(typeof id).toBe('number')
  })
})
