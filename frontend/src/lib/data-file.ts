import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { buildModelFromLegacy, LEGACY_TABLE_KEYS, type LegacyTables } from '@/lib/model/legacy-migration'
import {
  accountsTable,
  allocationTargetsTable,
  budgetsTable,
  cardsTable,
  categoriesTable,
  categoryRulesTable,
  entriesTable,
  tableDefsTable,
} from '@/lib/model/model-db'
import { notesTable } from '@/sections/notes/notes-db'

/**
 * v1 was the encrypted (.pmvault) format — unreadable, rejected on import.
 * v2 was the five hardcoded tables; it still imports, upgraded on the way in.
 * v3 carries the configurable model: accounts, cards, table definitions and the
 * category vocabulary travel with the rows, so importing into a blank browser restores
 * the user's whole setup rather than a pile of untitled data.
 */
export const DATA_EXPORT_VERSION = 3 as const
export const DATA_FILE_NAME = 'personal-management-data.pmdata'
export const DATA_FILE_EXTENSION = '.pmdata'

/** Everything that round-trips. Key order here is the order tables are cleared/restored. */
const TABLES = {
  accounts: accountsTable,
  cards: cardsTable,
  tableDefs: tableDefsTable,
  categories: categoriesTable,
  categoryRules: categoryRulesTable,
  entries: entriesTable,
  budgets: budgetsTable,
  allocationTargets: allocationTargetsTable,
  notes: notesTable,
  assistantPrompts: assistantPromptsTable,
  assistantConfig: assistantConfigTable,
} as const

export type DataTableKey = keyof typeof TABLES

export interface DataExportFile {
  version: typeof DATA_EXPORT_VERSION
  exportedAt: number
  tables: Record<DataTableKey, LocalRow[]>
}

const TABLE_KEYS = Object.keys(TABLES) as DataTableKey[]

export async function hasAnyData(): Promise<boolean> {
  return (await countAllRows()) > 0
}

/** Total rows across every table — drives the "what's stored here" summary in Data. */
export async function countAllRows(): Promise<number> {
  const counts = await Promise.all(TABLE_KEYS.map((key) => TABLES[key].count()))
  return counts.reduce((sum, count) => sum + count, 0)
}

export async function exportData(): Promise<DataExportFile> {
  const entries = await Promise.all(TABLE_KEYS.map(async (key) => [key, await TABLES[key].toArray()] as const))
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: Date.now(),
    tables: Object.fromEntries(entries) as DataExportFile['tables'],
  }
}

export async function wipeAllData(): Promise<void> {
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].clear()))
  await refreshAllLocalStores()
}

/** Wipes all tables, then restores the imported rows — bulkPut preserves their original ids. */
export async function importData(file: DataExportFile): Promise<void> {
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].clear()))
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].bulkPut(file.tables[key] ?? [])))
  await refreshAllLocalStores()
}

function asRows(value: unknown): LocalRow[] {
  return Array.isArray(value) ? (value as LocalRow[]) : []
}

/**
 * Rewrites a v2 file (five fixed tables) into the v3 shape, turning each populated
 * legacy table into a table definition plus tagged entries — the same mapping the
 * in-browser migration uses, so a file and a live database upgrade identically.
 */
function upgradeV2(record: Record<string, unknown>): DataExportFile {
  const tables = (record.tables ?? {}) as Record<string, unknown>
  const legacy: LegacyTables = {}
  for (const key of LEGACY_TABLE_KEYS) legacy[key] = asRows(tables[key])

  const { tableDefs, entries } = buildModelFromLegacy(legacy)

  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    tables: {
      accounts: [],
      cards: [],
      tableDefs,
      categories: [],
      categoryRules: [],
      entries,
      budgets: [],
      allocationTargets: [],
      notes: asRows(tables.notes),
      assistantPrompts: asRows(tables.assistantPrompts),
      assistantConfig: asRows(tables.assistantConfig),
    },
  }
}

/**
 * Throws a descriptive Error if `value` isn't a well-formed export this app can read.
 * A v2 file is accepted and upgraded; only the shape actually needed is required, so a
 * file written before a table existed still imports (missing tables come back empty).
 */
export function parseDataExportFile(value: unknown): DataExportFile {
  if (typeof value !== 'object' || value === null) throw new Error('Not a data export file.')
  const record = value as Record<string, unknown>

  if (typeof record.exportedAt !== 'number' || typeof record.tables !== 'object' || record.tables === null) {
    throw new Error('Malformed data export file.')
  }

  if (record.version === 2) return upgradeV2(record)

  if (record.version !== DATA_EXPORT_VERSION) {
    throw new Error(`Unsupported data export version: ${String(record.version)}.`)
  }

  const tables = record.tables as Record<string, unknown>
  // `entries` and `tableDefs` are what make a v3 file a v3 file; the rest may legitimately
  // be absent in a file written by an older build of this same version.
  for (const key of ['tableDefs', 'entries'] as const) {
    if (!Array.isArray(tables[key])) throw new Error(`Malformed data export file: missing "${key}" table.`)
  }

  const normalised = Object.fromEntries(TABLE_KEYS.map((key) => [key, asRows(tables[key])]))
  return { version: DATA_EXPORT_VERSION, exportedAt: record.exportedAt, tables: normalised as DataExportFile['tables'] }
}
