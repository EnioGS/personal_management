import { beforeEach, describe, expect, it } from 'vitest'
import { addItemsFor } from './writable-tables'
import { clearTables, seedTable } from './test-utils'
import { readTableTool } from './read-table'

const context = { attachments: [] }

describe('readTableTool', () => {
  beforeEach(clearTables)

  it('errors on an unknown table', async () => {
    const result = await readTableTool.execute({ table: 'nope' }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors on an invalid dateFrom/dateTo', async () => {
    const table = await seedTable('generic')
    expect(await readTableTool.execute({ table, dateFrom: 'not-a-date' }, context)).toContain(
      '"dateFrom" is not a valid date',
    )
    expect(await readTableTool.execute({ table, dateTo: 'not-a-date' }, context)).toContain(
      '"dateTo" is not a valid date',
    )
  })

  it('filters rows by an inclusive date range and includes flagged rows, tagged', async () => {
    const table = await seedTable('generic')
    await addItemsFor(Number(table), [
      { date: Date.parse('2026-01-01'), category: 'Outros', amount: 10 },
      { date: Date.parse('2026-02-15'), category: 'Outros', amount: 20 },
      { date: Date.parse('2026-03-01'), category: 'Outros', amount: 30, deleted: true },
    ])

    const result = await readTableTool.execute({ table, dateFrom: '2026-02-01', dateTo: '2026-03-01' }, context)

    expect(result).toContain('2 row(s) (1 flagged deleted) of 3 total')
    expect(result).toContain('2026-02-15')
    expect(result).toContain('2026-03-01')
    expect(result).not.toContain('2026-01-01')
    expect(result).toContain('true') // the flagged row's deleted column
  })

  it('rejects an unscoped read once filtered rows exceed the cap', async () => {
    const table = await seedTable('generic')
    const rows = Array.from({ length: 201 }, (_, i) => ({
      date: Date.parse('2026-01-01') + i * 86_400_000,
      category: 'Outros' as const,
      amount: 1,
    }))
    await addItemsFor(Number(table), rows)

    const result = await readTableTool.execute({ table }, context)
    expect(result).toContain('too many to return at once')

    const scopedResult = await readTableTool.execute({ table, dateFrom: '2026-01-01', dateTo: '2027-01-01' }, context)
    expect(scopedResult).toContain('too many to return at once')
  })

  it('only reads rows belonging to the requested table', async () => {
    const tableA = await seedTable('generic', 'A')
    const tableB = await seedTable('generic', 'B')
    await addItemsFor(Number(tableA), [{ date: Date.parse('2026-01-01'), category: 'Outros', amount: 1 }])
    await addItemsFor(Number(tableB), [{ date: Date.parse('2026-01-01'), category: 'Outros', amount: 2 }])

    const result = await readTableTool.execute({ table: tableA }, context)
    expect(result).toContain('1 row(s)')
  })
})
