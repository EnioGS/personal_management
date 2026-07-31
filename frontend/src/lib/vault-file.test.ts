import { beforeEach, describe, expect, it } from 'vitest'
import { createEncryptedTable } from '@/lib/secure-store/create-encrypted-table'
import { spendingTable } from '@/sections/finances/spending-db'
import { notesTable } from '@/sections/notes/secure-db'
import {
  VAULT_EXPORT_VERSION,
  exportVaultData,
  getAnyRowFromExport,
  getAnyRowFromTables,
  hasAnyData,
  importVaultData,
  parseVaultExportFile,
  verifyPassphraseAgainstRow,
  wipeVaultData,
  type VaultExportFile,
} from './vault-file'

interface Fixture {
  marker: string
}

const spending = createEncryptedTable<Fixture>(spendingTable)
const notes = createEncryptedTable<Fixture>(notesTable)

describe('vault-file', () => {
  beforeEach(async () => {
    await wipeVaultData()
  })

  it('hasAnyData is false on a clean vault, true after adding one row to any single table', async () => {
    expect(await hasAnyData()).toBe(false)

    await notes.add(`pw-${crypto.randomUUID()}`, { marker: 'x' })

    expect(await hasAnyData()).toBe(true)
  })

  it('round-trips export -> wipe -> import, preserving data across tables', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const marker = crypto.randomUUID()
    await spending.add(passphrase, { marker })
    await notes.add(passphrase, { marker })

    const exported = await exportVaultData()
    expect(exported.version).toBe(VAULT_EXPORT_VERSION)

    await wipeVaultData()
    expect(await hasAnyData()).toBe(false)

    await importVaultData(exported)
    expect(await hasAnyData()).toBe(true)

    const spendingRows = await spending.list(passphrase)
    const noteRows = await notes.list(passphrase)
    expect(spendingRows.some((r) => r?.marker === marker)).toBe(true)
    expect(noteRows.some((r) => r?.marker === marker)).toBe(true)
  })

  it('verifyPassphraseAgainstRow returns true for the correct passphrase, false for a wrong one', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    await spending.add(passphrase, { marker: 'x' })

    const row = await getAnyRowFromTables()
    expect(row).toBeTruthy()

    expect(await verifyPassphraseAgainstRow(passphrase, row!)).toBe(true)
    expect(await verifyPassphraseAgainstRow(`wrong-${crypto.randomUUID()}`, row!)).toBe(false)
  })

  it('getAnyRowFromTables/getAnyRowFromExport return null when everything is empty', async () => {
    expect(await getAnyRowFromTables()).toBeNull()

    const empty = await exportVaultData()
    expect(getAnyRowFromExport(empty)).toBeNull()
  })

  it('getAnyRowFromExport returns a real row once the export has data', async () => {
    await notes.add(`pw-${crypto.randomUUID()}`, { marker: 'x' })
    const exported = await exportVaultData()

    expect(getAnyRowFromExport(exported)).toBeTruthy()
  })

  describe('parseVaultExportFile', () => {
    const valid: VaultExportFile = {
      version: VAULT_EXPORT_VERSION,
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
      expect(() => parseVaultExportFile(valid)).not.toThrow()
    })

    it('rejects non-object input', () => {
      expect(() => parseVaultExportFile('not an object')).toThrow()
      expect(() => parseVaultExportFile(null)).toThrow()
    })

    it('rejects the wrong version', () => {
      expect(() => parseVaultExportFile({ ...valid, version: 999 })).toThrow()
    })

    it('rejects a missing tables object', () => {
      const { tables: _tables, ...withoutTables } = valid
      expect(() => parseVaultExportFile(withoutTables)).toThrow()
    })

    it('rejects a tables object missing one of the six keys', () => {
      const { notes: _notes, ...tablesWithoutNotes } = valid.tables
      expect(() => parseVaultExportFile({ ...valid, tables: tablesWithoutNotes })).toThrow()
    })
  })
})
