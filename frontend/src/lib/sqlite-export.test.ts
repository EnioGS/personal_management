import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { DATA_EXPORT_VERSION, type DataExportFile } from './data-file'
import { buildSqliteFile, looksLikeSqlite, parseSqliteFile } from './sqlite-export'

function exportFile(): DataExportFile {
  const empty = {
    accounts: [], cards: [], budgets: [], allocationTargets: [], labelRules: [], classificationNotes: [],
    ingestionAuditEvents: [], notes: [], assistantPrompts: [], assistantConfig: [], preferences: [],
  }
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: 1,
    tables: {
      ...empty,
      sourceFiles: [{
        id: 3,
        createdAt: 1,
        data: {
          originalFilename: 'Nubank_2026-09-08.csv',
          importedAt: 1,
          rawCsv: '',
          originalColumns: ['Data', 'Descrição', 'Valor'],
          assignments: { Data: 'date', Valor: 'amount' },
          signConvention: { kind: 'asImported' },
        },
      }],
      sourceRows: [{
        id: 1,
        createdAt: 1,
        data: {
          sourceId: 3,
          rowId: 'abc',
          values: { source_filename: 'Nubank_2026-09-08.csv', Data: '01/09/2026', Descrição: 'MERCADO', Valor: '-10' },
          labels: { sections: ['finances'], screens: ['spending'], category: 'mercado', subcategory: 'outros' },
        },
      }],
      confirmedRows: [{
        id: 1,
        createdAt: 1,
        data: {
          rowId: 'def', section: 'finances', screen: 'spending',
          confirmedAt: 1, date: 1, amount: -5, observations: '{}', category: 'mercado', subcategory: 'outros',
        },
      }],
    } as DataExportFile['tables'],
  }
}

async function open(bytes: Uint8Array) {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  return new SQL.Database(bytes)
}

describe('the exported .db', () => {
  it('is a real SQLite file', async () => {
    expect(looksLikeSqlite(await buildSqliteFile(exportFile()))).toBe(true)
  })

  it('carries a view per uploaded file, named after the file, with the file\'s own columns', async () => {
    const db = await open(await buildSqliteFile(exportFile()))
    try {
      const [result] = db.exec('SELECT "source_filename", "Descrição", "Valor", "category" FROM "source__nubank_2026_09_08_csv__3"')
      expect(result.values).toEqual([['Nubank_2026-09-08.csv', 'MERCADO', '-10', 'mercado']])
    } finally {
      db.close()
    }
  })

  it('carries a view per (section, screen) pair holding confirmed rows', async () => {
    const db = await open(await buildSqliteFile(exportFile()))
    try {
      const [result] = db.exec('SELECT row_id, amount FROM "confirmed__finances__spending"')
      expect(result.values).toEqual([['def', -5]])
    } finally {
      db.close()
    }
  })

  it('round-trips through the canonical tables, the views changing nothing', async () => {
    const restored = await parseSqliteFile(await buildSqliteFile(exportFile()))

    expect(restored.version).toBe(DATA_EXPORT_VERSION)
    expect(restored.tables.sourceRows[0].data).toMatchObject({ rowId: 'abc', values: { Descrição: 'MERCADO' } })
    expect(restored.tables.confirmedRows[0].data).toMatchObject({ rowId: 'def', amount: -5 })
  })
})
