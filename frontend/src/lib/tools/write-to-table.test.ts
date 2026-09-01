import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalStores } from '@/lib/local-store/test-utils'
import { useContributionsStore } from '@/sections/investments/contributions-store'
import { useFixedIncomeStore } from '@/sections/investments/fixed-income-store'
import { useVariableIncomeStore } from '@/sections/investments/variable-income-store'
import { useIncomeStore } from '@/sections/finances/income-store'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { writableTables } from './writable-tables'
import { writeToTableTool } from './write-to-table'

const context = { attachments: [] }

describe('writeToTableTool', () => {
  beforeEach(async () => {
    await clearLocalStores(useSpendingStore, useIncomeStore, useVariableIncomeStore, useFixedIncomeStore, useContributionsStore)
  })

  it('errors on an unknown table', async () => {
    const result = await writeToTableTool.execute({ table: 'nope', rows: [{}] }, context)
    expect(result).toContain('unknown table "nope"')
    expect(result).toContain('spending')
  })

  it('errors when rows is missing, not an array, or empty', async () => {
    expect(await writeToTableTool.execute({ table: 'spending' }, context)).toContain('"rows" argument')
    expect(await writeToTableTool.execute({ table: 'spending', rows: 'nope' }, context)).toContain('"rows" argument')
    expect(await writeToTableTool.execute({ table: 'spending', rows: [] }, context)).toContain('"rows" argument')
  })

  it('writes valid rows and reports partial rejection', async () => {
    const result = await writeToTableTool.execute(
      {
        table: 'spending',
        rows: [
          { date: '2026-01-01', category: 'Outros', amount: 42, note: 'ok' },
          { date: '2026-01-02', category: 'Outros', amount: 'nope' },
        ],
      },
      context,
    )
    expect(result).toContain('Wrote 1 of 2')
    expect(result).toContain('row 2:')
    expect(useSpendingStore.getState().items).toHaveLength(1)
  })

  it('rejects a select column with a value outside its options, listing the allowed values', async () => {
    const result = await writeToTableTool.execute(
      {
        table: 'variableIncome',
        rows: [{ date: '2026-01-01', asset: 'PETR4', type: 'NotAType', quantity: 1, price: 1 }],
      },
      context,
    )
    expect(result).toContain('Wrote 0 of 1')
    expect(result).toContain('must be one of')
    expect(result).toContain('buy')
  })

  it('accepts a combobox value outside its suggested options — the vocabulary is open', async () => {
    const result = await writeToTableTool.execute(
      { table: 'spending', rows: [{ date: '2026-01-01', category: 'Categoria Nova', amount: 10 }] },
      context,
    )
    expect(result).toContain('Wrote 1 of 1')
    expect(useSpendingStore.getState().items[0].category).toBe('Categoria Nova')
  })

  it('writes rows to each of the 5 registered tables', async () => {

    await writeToTableTool.execute(
      { table: 'spending', rows: [{ date: '2026-01-01', category: 'Outros', amount: 10 }] },
      context,
    )
    expect(useSpendingStore.getState().items).toHaveLength(1)

    await writeToTableTool.execute(
      { table: 'income', rows: [{ date: '2026-01-01', source: 'Salário', amount: 100 }] },
      context,
    )
    expect(useIncomeStore.getState().items).toHaveLength(1)

    await writeToTableTool.execute(
      {
        table: 'variableIncome',
        rows: [{ date: '2026-01-01', asset: 'PETR4', type: 'buy', quantity: 10, price: 30 }],
      },
      context,
    )
    expect(useVariableIncomeStore.getState().items).toHaveLength(1)

    await writeToTableTool.execute(
      { table: 'fixedIncome', rows: [{ date: '2026-01-01', asset: 'Tesouro', type: 'buy', quantity: 1, price: 500 }] },
      context,
    )
    expect(useFixedIncomeStore.getState().items).toHaveLength(1)
    expect(useVariableIncomeStore.getState().items).toHaveLength(1)

    await writeToTableTool.execute(
      { table: 'contributions', rows: [{ date: '2026-01-01', destination: 'Renda Fixa', amount: 200 }] },
      context,
    )
    expect(useContributionsStore.getState().items).toHaveLength(1)
  })

  it('description lists every registered table and a select column’s options', () => {
    for (const t of writableTables) {
      expect(writeToTableTool.description).toContain(t.key)
      expect(writeToTableTool.description).toContain(t.label)
    }
    expect(writeToTableTool.description).toContain('Outros')
  })

  it('parameters.table.enum matches the registry keys', () => {
    const params = writeToTableTool.parameters as { properties: { table: { enum: string[] } } }
    expect(params.properties.table.enum).toEqual(writableTables.map((t) => t.key))
  })
})
