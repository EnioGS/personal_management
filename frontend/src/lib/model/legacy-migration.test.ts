import { describe, expect, it } from 'vitest'
import { buildModelFromLegacy } from './legacy-migration'

const spendingRow = { id: 1, createdAt: 10, data: { date: 100, category: 'Alimentação', amount: 5, note: 'x' } }
const incomeRow = { id: 1, createdAt: 20, data: { date: 200, source: 'Salário', amount: 900 } }

describe('buildModelFromLegacy', () => {
  it('creates one table definition per populated legacy table', () => {
    const { tableDefs } = buildModelFromLegacy({ spending: [spendingRow], income: [incomeRow] })

    expect(tableDefs.map((t) => (t.data as { name: string }).name)).toEqual(['Gastos', 'Receitas'])
    expect(tableDefs.map((t) => (t.data as { kind: string }).kind)).toEqual(['generic', 'generic'])
  })

  it('skips legacy tables with no rows, so an empty install starts clean', () => {
    const { tableDefs, entries } = buildModelFromLegacy({ spending: [], income: [], contributions: [] })

    expect(tableDefs).toEqual([])
    expect(entries).toEqual([])
  })

  it('tags every entry with the id of its table definition', () => {
    const { tableDefs, entries } = buildModelFromLegacy({ spending: [spendingRow], income: [incomeRow] })

    const [gastos, receitas] = tableDefs
    const tableIds = entries.map((e) => (e.data as { tableId: number }).tableId)
    expect(tableIds).toEqual([gastos.id, receitas.id])
    expect(new Set(tableIds).size).toBe(2)
  })

  it("renames income's source to category so one vocabulary covers in and out", () => {
    const { entries } = buildModelFromLegacy({ income: [incomeRow] })

    expect(entries[0].data).toMatchObject({ category: 'Salário', amount: 900 })
    expect(entries[0].data).not.toHaveProperty('source')
  })

  it('preserves other fields and each row original createdAt', () => {
    const { entries } = buildModelFromLegacy({ spending: [spendingRow] })

    expect(entries[0].createdAt).toBe(10)
    expect(entries[0].data).toMatchObject({ date: 100, category: 'Alimentação', amount: 5, note: 'x' })
  })

  it('gives entries unique ids across tables', () => {
    const { entries } = buildModelFromLegacy({
      spending: [spendingRow, { ...spendingRow, id: 2 }],
      income: [incomeRow],
    })

    expect(new Set(entries.map((e) => e.id)).size).toBe(3)
  })

  it('maps investment tables to their stored class and contributions to their own kind', () => {
    const { tableDefs } = buildModelFromLegacy({
      variableIncome: [{ id: 1, createdAt: 1, data: {} }],
      fixedIncome: [{ id: 1, createdAt: 1, data: {} }],
      contributions: [{ id: 1, createdAt: 1, data: {} }],
    })

    expect(tableDefs.map((t) => (t.data as { kind: string }).kind)).toEqual(['investmentLedger', 'investmentLedger', 'contributions'])
    expect(tableDefs.slice(0, 2).map((t) => (t.data as { investmentClass: string }).investmentClass)).toEqual([
      'variableIncome',
      'fixedIncome',
    ])
  })
})
