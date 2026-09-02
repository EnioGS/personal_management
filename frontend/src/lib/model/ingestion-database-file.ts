import Papa from 'papaparse'
import { parseDataExportFile, type DataExportFile } from '@/lib/data-file'
import { looksLikeSqlite, parseSqliteFile } from '@/lib/sqlite-export'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { createIngestionSource } from './ingestion-source'
import type { Entry, TableDef } from './types'

export interface DatabaseFileImport {
  created: { name: string; rowCount: number }[]
  skipped: { name: string; reason: string }[]
}

/** Fields that describe where a row lives, not what it says — they are not source columns. */
const STRUCTURAL_FIELDS = new Set(['tableId', 'deleted'])
/** A familiar reading order; anything else follows alphabetically. */
const COLUMN_ORDER = ['date', 'direction', 'category', 'description', 'amount', 'asset', 'type', 'quantity', 'price', 'destination', 'note', 'importKey']

function readExport(bytes: Uint8Array): Promise<DataExportFile> {
  if (looksLikeSqlite(bytes)) return parseSqliteFile(bytes)
  return Promise.resolve(parseDataExportFile(JSON.parse(new TextDecoder().decode(bytes))))
}

function orderColumns(columns: Set<string>): string[] {
  const known = COLUMN_ORDER.filter((column) => columns.has(column))
  const rest = [...columns].filter((column) => !COLUMN_ORDER.includes(column)).sort((a, b) => a.localeCompare(b))
  return [...known, ...rest]
}

/**
 * A date inside an export is epoch milliseconds, which is a true value but not a
 * readable source column — and not something any date parser accepts back. Writing it
 * as a plain date keeps the CSV honest to a person reading it and to the destination
 * table's own parser. Every other value is written exactly as stored.
 */
function cellFor(field: string, value: unknown): string {
  if (field === 'date' && typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10)
  return value === undefined || value === null ? '' : String(value)
}

function csvForEntries(entries: Entry[]): { csv: string; rowCount: number } {
  const columns = new Set<string>()
  for (const entry of entries) for (const field of Object.keys(entry)) if (!STRUCTURAL_FIELDS.has(field)) columns.add(field)
  const ordered = orderColumns(columns)
  const rows = entries.map((entry) => Object.fromEntries(ordered.map((field) => [field, cellFor(field, entry[field])])))
  return { csv: Papa.unparse(rows, { columns: ordered }), rowCount: rows.length }
}

/**
 * Splits an exported database into one ingestion source per user table, so rows from
 * another vault (or an old backup) enter through the same mapping-and-labelling door
 * as a bank's CSV instead of being restored straight into a finance table.
 *
 * This is deliberately not the Vault's import: nothing is replaced, no entry is
 * written, and the file's own labels/settings are ignored. Only the rows travel, and
 * they arrive unlabelled — the user still decides what each one means and where it goes.
 */
export async function createIngestionSourcesFromDatabaseFile(filename: string, bytes: Uint8Array): Promise<DatabaseFileImport> {
  const data = await readExport(bytes)
  const tables = new Map((data.tables.tableDefs as LocalRow[]).map((row) => [row.id, row.data as TableDef]))
  const byTable = new Map<number, Entry[]>()
  let deletedRows = 0

  for (const row of data.tables.entries as LocalRow[]) {
    const entry = row.data as Entry
    if (!entry || typeof entry.tableId !== 'number') continue
    // A soft-deleted row was already superseded in the vault it came from; queueing it
    // for labelling would ask the user to decide about history they had discarded.
    if (entry.deleted) { deletedRows += 1; continue }
    byTable.set(entry.tableId, [...(byTable.get(entry.tableId) ?? []), entry])
  }

  const result: DatabaseFileImport = { created: [], skipped: [] }
  if (deletedRows > 0) result.skipped.push({ name: `${deletedRows} deleted row(s)`, reason: 'soft-deleted in the source database' })

  for (const [tableId, entries] of [...byTable.entries()].sort(([a], [b]) => a - b)) {
    const name = `${filename} — ${tables.get(tableId)?.name ?? `table ${tableId}`}`
    const { csv, rowCount } = csvForEntries(entries)
    try {
      await createIngestionSource(name, csv)
      result.created.push({ name, rowCount })
    } catch (error) {
      result.skipped.push({ name, reason: error instanceof Error ? error.message : 'could not be added' })
    }
  }

  if (result.created.length === 0 && result.skipped.length === 0) throw new Error(`"${filename}" contains no table rows to import.`)
  return result
}
