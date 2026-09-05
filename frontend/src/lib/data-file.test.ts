import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalTable } from '@/lib/local-store/create-local-table'
import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import {
  accountsTable,
  confirmedRowsTable,
  labelRulesTable,
  sourceFilesTable,
  sourceRowsTable,
} from '@/lib/model/model-db'
import { notesTable } from '@/sections/notes/notes-db'
import {
  DATA_EXPORT_VERSION,
  countAllRows,
  exportData,
  hasAnyData,
  importData,
  clearStoredData,
  describeImport,
  parseDataExportFile,
  wipeAllData,
  type DataExportFile,
} from './data-file'

interface Fixture {
  marker: string
}

const notes = createLocalTable<Fixture>(notesTable)

function emptyTables(): DataExportFile['tables'] {
  return {
    accounts: [],
    cards: [],
    budgets: [],
    allocationTargets: [],
    sourceFiles: [],
    sourceRows: [],
    confirmedRows: [],
    labelRules: [],
    ingestionAuditEvents: [],
    notes: [],
    assistantPrompts: [],
    assistantConfig: [],
    preferences: [],
  }
}

const sourceFile = {
  originalFilename: 'nubank_2026-09.csv',
  importedAt: 1,
  rawCsv: 'Data,Valor\n01/09/2026,"-10,00"',
  originalColumns: ['Data', 'Valor'],
  assignments: { Data: 'date', Valor: 'amount' },
  signConvention: { kind: 'asImported' },
}

describe('data-file', () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it('hasAnyData is false when empty, true after adding one row to any single table', async () => {
    expect(await hasAnyData()).toBe(false)

    await notes.add({ marker: 'x' })

    expect(await hasAnyData()).toBe(true)
  })

  it('countAllRows sums rows across tables', async () => {
    await notes.add({ marker: 'x' })
    await confirmedRowsTable.add({ createdAt: 1, data: { rowId: 'a', section: 'finances', screen: 'overview' } })

    expect(await countAllRows()).toBe(2)
  })

  it('round-trips export -> wipe -> import, preserving data across tables', async () => {
    const marker = crypto.randomUUID()
    await notes.add({ marker })
    await confirmedRowsTable.add({ createdAt: 1, data: { rowId: marker, section: 'finances', screen: 'overview', amount: -10 } })

    const exported = await exportData()
    expect(exported.version).toBe(DATA_EXPORT_VERSION)

    await wipeAllData()
    expect(await hasAnyData()).toBe(false)

    await importData(exported)

    expect((await notes.list()).some((row) => row.marker === marker)).toBe(true)
    expect((await confirmedRowsTable.toArray())[0].data).toMatchObject({ rowId: marker, amount: -10 })
  })

  it('carries the configurable model, so an import restores the setup and not just rows', async () => {
    await accountsTable.add({ createdAt: Date.now(), data: { name: 'Nubank', kind: 'checking' } })

    const exported = await exportData()
    await wipeAllData()
    await importData(exported)

    const restored = await accountsTable.toArray()
    expect(restored).toHaveLength(1)
    expect((restored[0].data as { name: string }).name).toBe('Nubank')
  })

  it('round-trips a file, its rows and their labels — the whole of what is still being worked on', async () => {
    const sourceId = await sourceFilesTable.add({ createdAt: 1, data: sourceFile })
    await sourceRowsTable.add({
      createdAt: 2,
      data: {
        sourceId,
        rowId: 'a1b2',
        values: { Data: '01/09/2026', Valor: '-10,00' },
        labels: { sections: ['finances'], screens: ['spending'], category: 'mercado', subcategory: 'outros' },
      },
    })

    const exported = await exportData()
    await wipeAllData()
    await importData(exported)

    expect((await sourceFilesTable.toArray())[0].data).toMatchObject({ originalFilename: 'nubank_2026-09.csv', assignments: { Valor: 'amount' } })
    expect((await sourceRowsTable.toArray())[0].data).toMatchObject({
      values: { Data: '01/09/2026', Valor: '-10,00' },
      labels: { sections: ['finances'], screens: ['spending'], category: 'mercado' },
    })
  })

  describe('parseDataExportFile', () => {
    const valid: DataExportFile = {
      version: DATA_EXPORT_VERSION,
      exportedAt: Date.now(),
      tables: emptyTables(),
    }

    it('accepts a well-formed export', () => {
      expect(() => parseDataExportFile(valid)).not.toThrow()
    })

    it('rejects non-object input', () => {
      expect(() => parseDataExportFile('not an object')).toThrow()
      expect(() => parseDataExportFile(null)).toThrow()
    })

    it('rejects every version written before the one-phase model, saying why', () => {
      for (const version of [1, 2, 3, 7]) {
        expect(() => parseDataExportFile({ ...valid, version })).toThrow(/staged rows and table definitions/)
      }
      expect(() => parseDataExportFile({ ...valid, version: 999 })).toThrow()
    })

    it('rejects a missing tables object', () => {
      const { tables: _tables, ...withoutTables } = valid
      expect(() => parseDataExportFile(withoutTables)).toThrow()
    })

    it('fills in stores a file does not carry rather than rejecting it', () => {
      const parsed = parseDataExportFile({
        version: DATA_EXPORT_VERSION,
        exportedAt: Date.now(),
        tables: { confirmedRows: [] },
      })

      expect(parsed.tables.sourceFiles).toEqual([])
      expect(parsed.tables.notes).toEqual([])
      expect(parsed.tables.labelRules).toEqual([])
    })
  })
})

describe('what an export carries, and what clearing keeps', () => {
  beforeEach(async () => { await wipeAllData() })

  it('takes the whole setup with it — connections, prompts, rules and preferences included', async () => {
    await assistantConfigTable.add({ createdAt: 1, data: { provider: 'openrouter', apiKey: 'sk-or-secret', model: 'openai/gpt-5.6-luna', isActive: true } })
    await assistantPromptsTable.add({ createdAt: 1, data: { key: 'system', content: 'Be brief.' } })
    await labelRulesTable.add({ createdAt: 1, data: { context: 'source', field: 'description', contains: 'fatura', labels: { category: 'cartão' }, rationale: 'Paying the card bill.', createdBy: 'user', createdAt: 1 } })
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('locale', 'en')

    const exported = await exportData()

    expect(exported.tables.assistantConfig).toHaveLength(1)
    expect(exported.tables.assistantPrompts).toHaveLength(1)
    expect(exported.tables.labelRules).toHaveLength(1)
    expect(exported.tables.preferences.map((row) => row.data)).toEqual([{ key: 'theme', value: 'dark' }, { key: 'locale', value: 'en' }])

    localStorage.setItem('theme', 'light')
    await wipeAllData()
    await importData(exported)

    expect((await assistantConfigTable.toArray())[0].data).toMatchObject({ apiKey: 'sk-or-secret' })
    expect((await labelRulesTable.toArray())[0].data).toMatchObject({ contains: 'fatura' })
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('keeps the accounts and cards when the data is cleared, and nothing that came from a file', async () => {
    await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    const sourceId = await sourceFilesTable.add({ createdAt: 1, data: sourceFile })
    await sourceRowsTable.add({ createdAt: 2, data: { sourceId, rowId: 'a', values: {}, labels: {} } })
    await confirmedRowsTable.add({ createdAt: 2, data: { rowId: 'a', section: 'finances', screen: 'overview' } })

    await clearStoredData()

    expect(await accountsTable.count()).toBe(1)
    expect(await sourceFilesTable.count()).toBe(0)
    expect(await sourceRowsTable.count()).toBe(0)
    expect(await confirmedRowsTable.count()).toBe(0)
  })
})

describe('importing a file this version did not write', () => {
  beforeEach(async () => { await wipeAllData() })

  it('reports the stores it lacks and the ones it does not understand, and names the files it carries', async () => {
    const file = {
      version: DATA_EXPORT_VERSION,
      exportedAt: 1,
      tables: {
        sourceFiles: [
          { id: 1, createdAt: 1, data: { ...sourceFile, originalFilename: 'nubank.csv' } },
          { id: 2, createdAt: 1, data: { ...sourceFile, originalFilename: 'itau.csv' } },
        ],
        confirmedRows: [],
        somethingNewer: [{ id: 1, createdAt: 1, data: {} }],
      },
    } as unknown as DataExportFile

    const report = describeImport(file)

    expect(report.extraTables).toEqual(['nubank.csv', 'itau.csv'])
    expect(report.unknownStores).toEqual(['somethingNewer'])
    expect(report.absentStores).toContain('labelRules')

    await importData(file)

    expect(await sourceFilesTable.count()).toBe(2)
  })
})
