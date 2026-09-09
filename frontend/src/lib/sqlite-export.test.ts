import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { DATA_EXPORT_VERSION, type DataExportFile } from './data-file'
import { buildSqliteFile, looksLikeSqlite, parseSqliteFile } from './sqlite-export'

function exportFile(): DataExportFile {
  const empty = {
    accounts: [], cards: [], budgets: [], allocationTargets: [], labelRules: [], classificationNotes: [], agentMemory: [], conversations: [], usageTotals: [], profileUsage: [], assistantProfiles: [],
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
          assignments: { Data: 'date', Valor: 'value' },
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
          confirmedAt: 1, date: 1, value: -5, observations: '{}', category: 'mercado', subcategory: 'outros',
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
      const [result] = db.exec('SELECT row_id, value FROM "confirmed__finances__spending"')
      expect(result.values).toEqual([['def', -5]])
    } finally {
      db.close()
    }
  })

  it('round-trips through the canonical tables, the views changing nothing', async () => {
    const restored = await parseSqliteFile(await buildSqliteFile(exportFile()))

    expect(restored.version).toBe(DATA_EXPORT_VERSION)
    expect(restored.tables.sourceRows[0].data).toMatchObject({ rowId: 'abc', values: { Descrição: 'MERCADO' } })
    expect(restored.tables.confirmedRows[0].data).toMatchObject({ rowId: 'def', value: -5 })
  })
})

describe('a file exported by an older version', () => {
  it('opens here, its missing columns empty and its retired ones ignored', async () => {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
    const db = new SQL.Database()
    // The confirmed table as it stood before `class`, with the three investment columns
    // that have since been retired.
    db.run('CREATE TABLE "confirmed_rows" (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, row_id TEXT, section TEXT, screen TEXT, confirmed_at INTEGER, date INTEGER, value REAL, observations TEXT, category TEXT, subcategory TEXT, asset TEXT, amount REAL, price REAL, investment_type TEXT, investment_class TEXT, account TEXT, card TEXT, marked_for_elimination INTEGER)')
    db.run(`INSERT INTO "confirmed_rows" (created_at, row_id, section, screen, category, subcategory, asset, investment_class) VALUES (1, 'a1', 'finances', 'investments', 'tesouro', 'IPCA+', 'PETR4', 'Renda Fixa')`)
    db.run('CREATE TABLE "_export_meta" (version INTEGER, exported_at INTEGER)')
    db.run(`INSERT INTO "_export_meta" VALUES (${DATA_EXPORT_VERSION}, 1)`)
    const bytes = db.export()
    db.close()

    const parsed = await parseSqliteFile(bytes)
    const data = (parsed.tables.confirmedRows ?? [])[0]?.data as Record<string, unknown>

    expect(data).toMatchObject({ rowId: 'a1', category: 'tesouro', subcategory: 'IPCA+' })
    // The retired columns are not read, and the label that did not exist yet arrives empty.
    expect(data).not.toHaveProperty('asset')
    expect(data.class ?? null).toBeNull()
  })
})

describe('a profile making the round trip', () => {
  it('comes back with its wordings and the connections it sends under', async () => {
    const profile = {
      name: 'Terse',
      isActive: true,
      overrides: { system: 'Say less.', 'tool.mark_rows': 'Marks rows.' },
      connections: [{ id: 1, provider: 'openai', apiKey: 'sk-test', model: 'gpt', isActive: true }],
    }
    const file = { ...exportFile(), tables: { ...exportFile().tables, assistantProfiles: [{ id: 1, createdAt: 1, data: profile }] } }

    const parsed = await parseSqliteFile(await buildSqliteFile(file))

    expect(parsed.tables.assistantProfiles[0].data).toEqual(profile)
  })
})
