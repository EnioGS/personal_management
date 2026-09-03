import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData, type DataExportFile, DATA_EXPORT_VERSION } from '@/lib/data-file'
import { ingestionSourcesTable } from './model-db'
import { parseIngestionCsv } from './ingestion-source'
import { createIngestionSourcesFromDatabaseFile } from './ingestion-database-file'
import type { IngestionSource } from './types'

const emptyTables = {
  accounts: [], cards: [], tableDefs: [], categories: [], entries: [], budgets: [], allocationTargets: [],
  ingestionSources: [], ingestionColumnMappings: [], ingestionRows: [], entryLabels: [], ingestionAuditEvents: [], labelRules: [], preferences: [],
  notes: [], assistantPrompts: [], assistantConfig: [],
} as DataExportFile['tables']

function exportFile(): DataExportFile {
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: 1,
    tables: {
      ...emptyTables,
      tableDefs: [
        { id: 1, createdAt: 1, data: { name: 'Extrato Nubank', kind: 'bankLedger' } },
        { id: 2, createdAt: 1, data: { name: 'Fatura Nubank', kind: 'cardLedger' } },
      ],
      entries: [
        { id: 10, createdAt: 1, data: { tableId: 1, date: Date.UTC(2024, 8, 1), direction: 'in', category: 'Pix', description: 'Transferência', amount: 1200 } },
        { id: 11, createdAt: 1, data: { tableId: 1, date: Date.UTC(2024, 8, 2), direction: 'out', category: 'Pix', description: 'Enviada', amount: 30, deleted: true } },
        { id: 12, createdAt: 1, data: { tableId: 2, date: Date.UTC(2024, 8, 3), category: 'Assinatura', description: 'Amazonprimebr', amount: 19.9 } },
      ],
    },
  }
}

/**
 * Exports come in two encodings and `createIngestionSourcesFromDatabaseFile` reads
 * both. These tests use the JSON one: sql.js needs its WebAssembly binary, which
 * cannot be located under vitest, and the SQLite branch is one call to the same
 * `parseSqliteFile` the Vault's import already uses.
 */
function exportBytes(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(exportFile()))
}

describe('importing an exported database as ingestion sources', () => {
  beforeEach(async () => { await wipeAllData() })

  it('splits it into one source per user table, naming each after the table it came from', async () => {
    const result = await createIngestionSourcesFromDatabaseFile('backup.db', exportBytes())

    expect(result.created).toEqual([
      { name: 'backup.db — Extrato Nubank', rowCount: 1 },
      { name: 'backup.db — Fatura Nubank', rowCount: 1 },
    ])
    const sources = (await ingestionSourcesTable.toArray()).map((row) => row.data as IngestionSource)
    expect(sources.map((source) => source.status)).toEqual(['draftSource', 'draftSource'])
  })

  it('writes each row as real columns, with the stored epoch date as a date', async () => {
    await createIngestionSourcesFromDatabaseFile('backup.db', exportBytes())

    const bank = (await ingestionSourcesTable.toArray()).map((row) => row.data as IngestionSource).find((source) => source.originalFilename.endsWith('Extrato Nubank'))!
    const parsed = parseIngestionCsv(bank.rawCsv)

    expect(parsed.columns).toEqual(['date', 'direction', 'category', 'description', 'amount'])
    expect(parsed.rows[0]).toEqual({ date: '2024-09-01', direction: 'in', category: 'Pix', description: 'Transferência', amount: '1200' })
  })

  it('leaves rows deleted in the source database behind, and says how many', async () => {
    const result = await createIngestionSourcesFromDatabaseFile('backup.db', exportBytes())

    expect(result.skipped).toEqual([{ name: '1 deleted row(s)', reason: 'soft-deleted in the source database' }])
  })

  it('reports each table that was already imported instead of duplicating it', async () => {
    await createIngestionSourcesFromDatabaseFile('backup.db', exportBytes())

    const again = await createIngestionSourcesFromDatabaseFile('backup.db', exportBytes())

    expect(again.created).toEqual([])
    expect(again.skipped.filter((skipped) => skipped.reason.includes('already imported'))).toHaveLength(2)
    expect(await ingestionSourcesTable.count()).toBe(2)
  })
})
