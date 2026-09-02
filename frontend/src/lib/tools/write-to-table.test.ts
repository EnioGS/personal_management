import { beforeEach, describe, expect, it } from 'vitest'
import { itemsFor, writableTables } from './writable-tables'
import { clearTables, seedTable } from './test-utils'
import { writeToTableTool } from './write-to-table'

const context = { attachments: [] }

describe('writeToTableTool', () => {
  beforeEach(clearTables)

  it('errors on an unknown table', async () => {
    const table = await seedTable('generic', 'Gastos')
    const result = await writeToTableTool.execute({ table: 'nope', rows: [{}] }, context)
    expect(result).toContain('unknown table "nope"')
    expect(result).toContain(table)
  })

  it('errors when rows is missing, not an array, or empty', async () => {
    const table = await seedTable('generic')
    expect(await writeToTableTool.execute({ table }, context)).toContain('"rows" argument')
    expect(await writeToTableTool.execute({ table, rows: 'nope' }, context)).toContain('"rows" argument')
    expect(await writeToTableTool.execute({ table, rows: [] }, context)).toContain('"rows" argument')
  })

  it('writes valid rows and reports partial rejection', async () => {
    const table = await seedTable('generic')
    const result = await writeToTableTool.execute(
      {
        table,
        rows: [
          { date: '2026-01-01', category: 'Outros', amount: 42, note: 'ok' },
          { date: '2026-01-02', category: 'Outros', amount: 'nope' },
        ],
      },
      context,
    )
    expect(result).toContain('Wrote 1 of 2')
    expect(result).toContain('row 2:')
    expect(itemsFor(Number(table))).toHaveLength(1)
  })

  it('rejects a select column with a value outside its options, listing the allowed values', async () => {
    const table = await seedTable('investmentLedger')
    const result = await writeToTableTool.execute(
      { table, rows: [{ date: '2026-01-01', category: 'Ações', asset: 'PETR4', type: 'NotAType', quantity: 1, price: 1 }] },
      context,
    )
    expect(result).toContain('Wrote 0 of 1')
    expect(result).toContain('must be one of')
    expect(result).toContain('buy')
  })

  it('accepts a combobox value outside its suggested options — the vocabulary is open', async () => {
    const table = await seedTable('generic')
    const result = await writeToTableTool.execute(
      { table, rows: [{ date: '2026-01-01', category: 'Categoria Nova', amount: 10 }] },
      context,
    )
    expect(result).toContain('Wrote 1 of 1')
    expect(itemsFor(Number(table))[0].category).toBe('Categoria Nova')
  })

  it('writes rows to each of the table kinds', async () => {
    const generic = await seedTable('generic')
    await writeToTableTool.execute({ table: generic, rows: [{ date: '2026-01-01', category: 'Outros', amount: 10 }] }, context)
    expect(itemsFor(Number(generic))).toHaveLength(1)

    const bank = await seedTable('bankLedger')
    await writeToTableTool.execute(
      { table: bank, rows: [{ date: '2026-01-01', direction: 'in', category: 'Salário', amount: 100 }] },
      context,
    )
    expect(itemsFor(Number(bank))).toHaveLength(1)

    const investment = await seedTable('investmentLedger')
    await writeToTableTool.execute(
      { table: investment, rows: [{ date: '2026-01-01', category: 'Ações', asset: 'PETR4', type: 'buy', quantity: 10, price: 30 }] },
      context,
    )
    expect(itemsFor(Number(investment))).toHaveLength(1)

    const contributions = await seedTable('contributions')
    await writeToTableTool.execute(
      { table: contributions, rows: [{ date: '2026-01-01', destination: 'Renda Fixa', amount: 200 }] },
      context,
    )
    expect(itemsFor(Number(contributions))).toHaveLength(1)

    const card = await seedTable('cardLedger')
    await writeToTableTool.execute(
      { table: card, rows: [{ date: '2026-01-01', category: 'Streaming', amount: 30 }] },
      context,
    )
    expect(itemsFor(Number(card))).toHaveLength(1)
  })

  it('description lists every registered table and a select column’s options', async () => {
    await seedTable('generic', 'Gastos')
    await seedTable('investmentLedger', 'Tesouro', 'fixedIncome')

    for (const t of writableTables()) {
      expect(writeToTableTool.description).toContain(t.key)
      expect(writeToTableTool.description).toContain(t.label)
    }
    expect(writeToTableTool.description).toContain('buy')
    expect(writeToTableTool.description).toContain('Fixed Income')
  })

  it('parameters.table.enum matches the registry keys', async () => {
    await seedTable('generic')
    await seedTable('cardLedger')

    const params = writeToTableTool.parameters as { properties: { table: { enum: string[] } } }
    expect(params.properties.table.enum).toEqual(writableTables().map((t) => t.key))
  })
})
