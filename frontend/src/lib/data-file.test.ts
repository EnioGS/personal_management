import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalTable } from '@/lib/local-store/create-local-table'
import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import {
  accountsTable,
  categoriesTable,
  entriesTable,
  labelRulesTable,
  ingestionColumnMappingsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
  tableDefsTable,
} from '@/lib/model/model-db'
import { notesTable } from '@/sections/notes/notes-db'
import {
  DATA_EXPORT_VERSION,
  countAllRows,
  exportData,
  hasAnyData,
  importData,
  clearStoredData,
  parseDataExportFile,
  wipeAllData,
  type DataExportFile,
} from './data-file'

interface Fixture {
  marker: string
}

const entries = createLocalTable<Fixture>(entriesTable)
const notes = createLocalTable<Fixture>(notesTable)

function emptyTables(): DataExportFile['tables'] {
  return {
    accounts: [],
    cards: [],
    tableDefs: [],
    categories: [],
    entries: [],
    budgets: [],
    allocationTargets: [],
    ingestionSources: [],
    ingestionColumnMappings: [],
    ingestionRows: [],
    entryLabels: [],
    ingestionAuditEvents: [], labelRules: [], preferences: [],
    notes: [],
    assistantPrompts: [],
    assistantConfig: [],
  }
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
    await entries.add({ marker: 'y' })

    expect(await countAllRows()).toBe(2)
  })

  it('round-trips export -> wipe -> import, preserving data across tables', async () => {
    const marker = crypto.randomUUID()
    await entries.add({ marker })
    await notes.add({ marker })

    const exported = await exportData()
    expect(exported.version).toBe(DATA_EXPORT_VERSION)

    await wipeAllData()
    expect(await hasAnyData()).toBe(false)

    await importData(exported)

    expect((await entries.list()).some((r) => r.marker === marker)).toBe(true)
    expect((await notes.list()).some((r) => r.marker === marker)).toBe(true)
  })

  it('carries the configurable model, so an import restores the setup and not just rows', async () => {
    await tableDefsTable.add({ createdAt: Date.now(), data: { name: 'Nubank', kind: 'cardLedger' } })

    const exported = await exportData()
    await wipeAllData()
    await importData(exported)

    const restored = await tableDefsTable.toArray()
    expect(restored).toHaveLength(1)
    expect((restored[0].data as { name: string }).name).toBe('Nubank')
  })

  it('round-trips the category vocabulary', async () => {
    await categoriesTable.add({ createdAt: 1, data: { name: 'Recebida pelo Pix', scope: 'bankLedger', archived: false } })

    const exported = await exportData()
    expect(exported.tables.categories).toHaveLength(1)

    await wipeAllData()
    await importData(exported)

    expect((await categoriesTable.toArray())[0].data).toEqual({
      name: 'Recebida pelo Pix',
      scope: 'bankLedger',
      archived: false,
    })
  })

  it('round-trips source provenance, mappings and staged labels', async () => {
    const sourceId = await ingestionSourcesTable.add({
      createdAt: 1,
      data: {
        originalFilename: 'nubank.csv',
        sourceFingerprint: 'file-hash',
        importedAt: 1,
        rawCsv: 'Data,Valor\n2026-01-01,10',
        originalColumns: ['Data', 'Valor'],
        supplementalColumns: ['asset'],
        rowCount: 1,
        status: 'mapped',
      },
    })
    await ingestionColumnMappingsTable.add({
      createdAt: 2,
      data: { sourceId, sourceColumn: 'Data', targetField: 'date' },
    })
    await ingestionRowsTable.add({
      createdAt: 3,
      data: {
        sourceId,
        sourceRowIndex: 0,
        sourceRowFingerprint: 'row-hash',
        rawValues: { Data: '2026-01-01', Valor: '10' },
        mappedValues: { date: 1767225600000, amount: 10 },
        labels: { sections: ['finances'], subsections: ['overview'], flowRole: 'inflow' },
        status: 'unlabelled',
        validationErrors: ['Choose a destination table.'],
      },
    })

    const exported = await exportData()
    await wipeAllData()
    await importData(exported)

    expect(await ingestionSourcesTable.toArray()).toHaveLength(1)
    expect(await ingestionColumnMappingsTable.toArray()).toHaveLength(1)
    expect((await ingestionRowsTable.toArray())[0].data).toMatchObject({
      rawValues: { Data: '2026-01-01', Valor: '10' },
      labels: { sections: ['finances'], subsections: ['overview'], flowRole: 'inflow' },
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

    it('rejects the old encrypted (version 1) format and any unknown version', () => {
      expect(() => parseDataExportFile({ ...valid, version: 1 })).toThrow()
      expect(() => parseDataExportFile({ ...valid, version: 999 })).toThrow()
    })

    it('rejects a missing tables object', () => {
      const { tables: _tables, ...withoutTables } = valid
      expect(() => parseDataExportFile(withoutTables)).toThrow()
    })

    it('rejects a v3 file missing the tables that define the model', () => {
      const { entries: _entries, ...withoutEntries } = valid.tables
      expect(() => parseDataExportFile({ ...valid, tables: withoutEntries })).toThrow()
    })

    it('fills in tables a file predates rather than rejecting it', () => {
      const parsed = parseDataExportFile({
        version: DATA_EXPORT_VERSION,
        exportedAt: Date.now(),
        tables: { tableDefs: [], entries: [] },
      })

      expect(parsed.tables.categories).toEqual([])
      expect(parsed.tables.notes).toEqual([])
      expect(parsed.tables.ingestionRows).toEqual([])
    })

    it('adds an investment class when importing a pre-class investment table', () => {
      const parsed = parseDataExportFile({
        version: DATA_EXPORT_VERSION,
        exportedAt: Date.now(),
        tables: {
          ...emptyTables(),
          tableDefs: [{ id: 1, createdAt: 1, data: { name: 'Renda Fixa', kind: 'investmentLedger' } }],
        },
      })

      expect(parsed.tables.tableDefs[0].data).toMatchObject({ investmentClass: 'fixedIncome' })
    })
  })

  describe('v2 files', () => {
    const v2 = {
      version: 2,
      exportedAt: 1_700_000_000_000,
      tables: {
        spending: [{ id: 1, createdAt: 10, data: { date: 1, category: 'Alimentação', amount: 5 } }],
        income: [{ id: 1, createdAt: 20, data: { date: 2, source: 'Salário', amount: 900 } }],
        variableIncome: [],
        fixedIncome: [],
        contributions: [],
        notes: [{ id: 1, createdAt: 30, data: { text: 'hello' } }],
        assistantPrompts: [],
        assistantConfig: [],
      },
    }

    it('upgrades to v3 rather than rejecting, turning each populated table into a definition', () => {
      const parsed = parseDataExportFile(v2)

      expect(parsed.version).toBe(DATA_EXPORT_VERSION)
      expect(parsed.tables.tableDefs.map((t) => (t.data as { name: string }).name)).toEqual(['Gastos', 'Receitas'])
      expect(parsed.tables.entries).toHaveLength(2)
    })

    it("renames income's source onto the shared category vocabulary", () => {
      const parsed = parseDataExportFile(v2)
      const incomeDef = parsed.tables.tableDefs.find((t) => (t.data as { name: string }).name === 'Receitas')!
      const incomeEntry = parsed.tables.entries.find(
        (e) => (e.data as { tableId: number }).tableId === incomeDef.id,
      )!

      expect(incomeEntry.data).toMatchObject({ category: 'Salário' })
      expect(incomeEntry.data).not.toHaveProperty('source')
    })

    it('carries non-table data across untouched', () => {
      const parsed = parseDataExportFile(v2)
      expect(parsed.tables.notes).toHaveLength(1)
    })

    it('skips legacy tables that had no rows', () => {
      const parsed = parseDataExportFile(v2)
      const names = parsed.tables.tableDefs.map((t) => (t.data as { name: string }).name)
      expect(names).not.toContain('Renda Variável')
    })

    it('imports end to end', async () => {
      await importData(parseDataExportFile(v2))

      expect(await tableDefsTable.count()).toBe(2)
      expect(await entriesTable.count()).toBe(2)
    })
  })

  it('upgrades a v3 export with no ingestion tables', () => {
    const parsed = parseDataExportFile({
      version: 3,
      exportedAt: 1,
      tables: { tableDefs: [], entries: [] },
    })

    expect(parsed.version).toBe(DATA_EXPORT_VERSION)
    expect(parsed.tables.ingestionSources).toEqual([])
    expect(parsed.tables.entryLabels).toEqual([])
  })
})

describe('what an export carries, and what clearing keeps', () => {
  beforeEach(async () => { await wipeAllData() })

  it('takes the whole setup with it — connections, prompts, rules and preferences included', async () => {
    await assistantConfigTable.add({ createdAt: 1, data: { provider: 'openrouter', apiKey: 'sk-or-secret', model: 'openai/gpt-5.6-luna', isActive: true } })
    await assistantPromptsTable.add({ createdAt: 1, data: { key: 'system', content: 'Be brief.' } })
    await labelRulesTable.add({ createdAt: 1, data: { field: 'description', contains: 'fatura', labels: { flowRole: 'outflow' }, rationale: 'Paying the card bill.', createdBy: 'user', createdAt: 1 } })
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

  it('keeps the accounts, cards and tables when the data is cleared', async () => {
    const accountId = await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Extrato bancário', kind: 'bankLedger', accountId } })
    await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, amount: 10 } })
    await ingestionRowsTable.add({ createdAt: 2, data: { sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r', rawValues: {}, mappedValues: {}, labels: {}, status: 'unlabelled', validationErrors: [] } })

    await clearStoredData()

    expect(await tableDefsTable.count()).toBe(1)
    expect(await accountsTable.count()).toBe(1)
    expect(await entriesTable.count()).toBe(0)
    expect(await ingestionRowsTable.count()).toBe(0)
  })
})
