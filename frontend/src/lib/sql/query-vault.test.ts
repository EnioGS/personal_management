import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import { confirmedTableName, describeVault, queryVault, sourceTableName } from './query-vault'

const file = {
  originalFilename: 'banco-agosto.csv',
  importedAt: 1,
  rawCsv: '',
  originalColumns: ['Data', 'Valor'],
  assignments: { Data: 'date', Valor: 'amount' },
  signConvention: { kind: 'asImported' },
}

describe('SQL over the browser data', () => {
  beforeEach(async () => { await wipeAllData() })

  it('names one table per file and one per (section, screen) pair', async () => {
    const sourceId = await sourceFilesTable.add({ createdAt: 1, data: file })
    await sourceRowsTable.add({ createdAt: 1, data: { sourceId, rowId: 'r1', values: { source_filename: 'banco-agosto.csv', Data: '01/08/2026', Valor: '10' }, labels: {} } })
    await confirmedRowsTable.add({ createdAt: 1, data: { rowId: 'r2', section: 'finances', screen: 'spending', sourceFilename: 'x.csv', confirmedAt: 1, amount: -10, observations: '{}', category: 'mercado', subcategory: 'outros' } })

    const tables = await describeVault()
    const names = tables.map((table) => table.name)

    expect(names).toContain(sourceTableName(file as never, sourceId))
    expect(names).toContain(confirmedTableName('finances', 'spending'))
    expect(names).toContain('label_rules')
    expect(tables.find((table) => table.name === 'label_rules')!.rows).toBe(0)
  })

  it('reads a file table under the columns the file actually wrote', async () => {
    const sourceId = await sourceFilesTable.add({ createdAt: 1, data: file })
    await sourceRowsTable.add({
      createdAt: 1,
      data: { sourceId, rowId: 'r1', values: { source_filename: 'banco-agosto.csv', Data: '01/08/2026', Valor: '10' }, labels: { screens: ['spending'], category: 'mercado' }, duplicateOf: 'other-row' },
    })

    const result = await queryVault(`SELECT "Valor", screens, category, duplicate_of FROM "${sourceTableName(file as never, sourceId)}"`)

    expect(result.columns).toEqual(['Valor', 'screens', 'category', 'duplicate_of'])
    expect(result.rows).toEqual([['10', 'spending', 'mercado', 'other-row']])
  })

  it('answers a question about signs, which is what a sign decision is made from', async () => {
    for (const amount of [-10, -20, 30]) {
      await confirmedRowsTable.add({ createdAt: 1, data: { rowId: `r${amount}`, section: 'finances', screen: 'spending', sourceFilename: 'x.csv', confirmedAt: 1, amount, observations: '{}', category: 'outros', subcategory: 'outros' } })
    }

    const result = await queryVault(`SELECT COUNT(*) FROM "${confirmedTableName('finances', 'spending')}" WHERE amount < 0`)

    expect(result.rows).toEqual([[2]])
  })

  it('refuses anything that would write, and anything that is two statements', async () => {
    await expect(queryVault('DELETE FROM label_rules')).rejects.toThrow(/Only SELECT/)
    await expect(queryVault('UPDATE label_rules SET name = "x"')).rejects.toThrow(/Only SELECT/)
    await expect(queryVault('SELECT 1; DROP TABLE label_rules')).rejects.toThrow(/One statement/)
  })

  it('reports the true total even when it hands back at most a screenful', async () => {
    for (let index = 0; index < 250; index += 1) {
      await confirmedRowsTable.add({ createdAt: 1, data: { rowId: `r${index}`, section: 'finances', screen: 'overview', sourceFilename: 'x.csv', confirmedAt: 1, amount: index, observations: '{}', category: 'outros', subcategory: 'outros' } })
    }

    const result = await queryVault(`SELECT row_id FROM "${confirmedTableName('finances', 'overview')}"`)

    expect(result.rowCount).toBe(250)
    expect(result.rows).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })
})
