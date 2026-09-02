import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalTable } from '@/lib/local-store/create-local-table'
import { entriesTable, tableDefsTable } from '@/lib/model/model-db'
import { notesTable } from '@/sections/notes/notes-db'
import {
  DATA_EXPORT_VERSION,
  countAllRows,
  exportData,
  hasAnyData,
  importData,
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
    categoryRules: [],
    entries: [],
    budgets: [],
    allocationTargets: [],
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
})
