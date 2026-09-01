import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalTable } from '@/lib/local-store/create-local-table'
import { spendingTable } from '@/sections/finances/spending-db'
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

const spending = createLocalTable<Fixture>(spendingTable)
const notes = createLocalTable<Fixture>(notesTable)

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
    await spending.add({ marker: 'y' })

    expect(await countAllRows()).toBe(2)
  })

  it('round-trips export -> wipe -> import, preserving data across tables', async () => {
    const marker = crypto.randomUUID()
    await spending.add({ marker })
    await notes.add({ marker })

    const exported = await exportData()
    expect(exported.version).toBe(DATA_EXPORT_VERSION)

    await wipeAllData()
    expect(await hasAnyData()).toBe(false)

    await importData(exported)

    expect((await spending.list()).some((r) => r.marker === marker)).toBe(true)
    expect((await notes.list()).some((r) => r.marker === marker)).toBe(true)
  })

  describe('parseDataExportFile', () => {
    const valid: DataExportFile = {
      version: DATA_EXPORT_VERSION,
      exportedAt: Date.now(),
      tables: {
        spending: [],
        income: [],
        variableIncome: [],
        fixedIncome: [],
        contributions: [],
        notes: [],
        assistantPrompts: [],
        assistantConfig: [],
      },
    }

    it('accepts a well-formed export', () => {
      expect(() => parseDataExportFile(valid)).not.toThrow()
    })

    it('rejects non-object input', () => {
      expect(() => parseDataExportFile('not an object')).toThrow()
      expect(() => parseDataExportFile(null)).toThrow()
    })

    it('rejects the old encrypted (version 1) format and any other version', () => {
      expect(() => parseDataExportFile({ ...valid, version: 1 })).toThrow()
      expect(() => parseDataExportFile({ ...valid, version: 999 })).toThrow()
    })

    it('rejects a missing tables object', () => {
      const { tables: _tables, ...withoutTables } = valid
      expect(() => parseDataExportFile(withoutTables)).toThrow()
    })

    it('rejects a tables object missing one of the table keys', () => {
      const { notes: _notes, ...tablesWithoutNotes } = valid.tables
      expect(() => parseDataExportFile({ ...valid, tables: tablesWithoutNotes })).toThrow()
    })
  })
})
