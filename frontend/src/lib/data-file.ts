import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { inferInvestmentClass } from '@/lib/model/investment-class'
import { buildModelFromLegacy, LEGACY_TABLE_KEYS, type LegacyTables } from '@/lib/model/legacy-migration'
import {
  accountsTable,
  allocationTargetsTable,
  budgetsTable,
  cardsTable,
  categoriesTable,
  entryLabelsTable,
  entriesTable,
  ingestionAuditEventsTable,
  ingestionColumnMappingsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
  labelRulesTable,
  tableDefsTable,
} from '@/lib/model/model-db'
import { preferencesTable } from '@/lib/preferences-table'
import { notesTable } from '@/sections/notes/notes-db'

/**
 * v1 was the encrypted (.pmvault) format — unreadable, rejected on import.
 * v2 was the five hardcoded tables; it still imports, upgraded on the way in.
 * v3 carries the configurable model: accounts, cards, table definitions and the
 * category vocabulary travel with the rows, so importing into a blank browser restores
 * the user's whole setup rather than a pile of untitled data. v4 also includes
 * ingestion sources, staged rows, label sidecars and their audit events. v5 drops
 * category rules: a row's category is a label set in the ingestion centre, so a rule
 * store no longer exists to round-trip. v6 adds standing labelling rules, and v7 the
 * interface preferences (theme, language) that live outside Dexie — so an export
 * restores a setup, not only its rows.
 */
export const DATA_EXPORT_VERSION = 7 as const
export const DATA_FILE_NAME = 'personal-management-data.db'
export const DATA_FILE_EXTENSION = '.db'
/** Still accepted on import (see `data-panel.tsx`) — a backup made before adr/0028. */
export const LEGACY_DATA_FILE_EXTENSION = '.pmdata'

/** Everything that round-trips. Key order here is the order tables are cleared/restored. */
const TABLES = {
  accounts: accountsTable,
  cards: cardsTable,
  tableDefs: tableDefsTable,
  categories: categoriesTable,
  entries: entriesTable,
  budgets: budgetsTable,
  allocationTargets: allocationTargetsTable,
  ingestionSources: ingestionSourcesTable,
  ingestionColumnMappings: ingestionColumnMappingsTable,
  ingestionRows: ingestionRowsTable,
  entryLabels: entryLabelsTable,
  ingestionAuditEvents: ingestionAuditEventsTable,
  labelRules: labelRulesTable,
  notes: notesTable,
  assistantPrompts: assistantPromptsTable,
  assistantConfig: assistantConfigTable,
  preferences: preferencesTable,
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

/**
 * What the app is, rather than what it holds: the accounts and cards a person set up,
 * and the tables every screen reads. Clearing the data leaves these alone — the table
 * set is fixed now, so wiping it only meant recreating the same six a moment later,
 * and an account is configuration, not a transaction.
 */
const SETUP_TABLES: DataTableKey[] = ['accounts', 'cards', 'tableDefs', 'preferences']

/** Clears the data while keeping the setup. This is what the Vault's clear button does. */
export async function clearStoredData(): Promise<void> {
  await Promise.all(TABLE_KEYS.filter((key) => !SETUP_TABLES.includes(key)).map((key) => TABLES[key].clear()))
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

/** v3 exports predate stored investment classes; enrich them before restoring rows. */
function withInvestmentClasses(rows: LocalRow[]): LocalRow[] {
  return rows.map((row) => {
    const table = row.data as Record<string, unknown> | undefined
    if (!table || table.kind !== 'investmentLedger' || table.investmentClass) return row
    return { ...row, data: { ...table, investmentClass: inferInvestmentClass(table.name) } }
  })
}

function emptyIngestionTables() {
  return {
    ingestionSources: [] as LocalRow[],
    ingestionColumnMappings: [] as LocalRow[],
    ingestionRows: [] as LocalRow[],
    entryLabels: [] as LocalRow[],
    ingestionAuditEvents: [] as LocalRow[],
    labelRules: [] as LocalRow[],
    preferences: [] as LocalRow[],
  }
}

/**
 * Rewrites a v2 file (five fixed tables) into the current shape, turning each populated
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
      entries,
      budgets: [],
      allocationTargets: [],
      ...emptyIngestionTables(),
      notes: asRows(tables.notes),
      assistantPrompts: asRows(tables.assistantPrompts),
      assistantConfig: asRows(tables.assistantConfig),
    },
  }
}

/** v3 had the configurable model but no source-ingestion or row-label stores. */
function upgradeV3(record: Record<string, unknown>): DataExportFile {
  const tables = record.tables as Record<string, unknown>
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    tables: {
      accounts: asRows(tables.accounts),
      cards: asRows(tables.cards),
      tableDefs: withInvestmentClasses(asRows(tables.tableDefs)),
      categories: asRows(tables.categories),
      entries: asRows(tables.entries),
      budgets: asRows(tables.budgets),
      allocationTargets: asRows(tables.allocationTargets),
      ...emptyIngestionTables(),
      notes: asRows(tables.notes),
      assistantPrompts: asRows(tables.assistantPrompts),
      assistantConfig: asRows(tables.assistantConfig),
    },
  }
}

/** v4 carries a categoryRules table this version dropped; v5 and v6 simply predate tables it has. */
function upgradeV4(record: Record<string, unknown>): DataExportFile {
  const tables = record.tables as Record<string, unknown>
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    tables: Object.fromEntries(TABLE_KEYS.map((key) => [key, asRows(tables[key])])) as Record<DataTableKey, LocalRow[]>,
  }
}

/**
 * Throws a descriptive Error if `value` isn't a well-formed export this app can read.
 * v2 and v3 files are accepted and upgraded; only the shape actually needed is
 * required, so a file written before an additive table existed still imports with
 * that table empty.
 */
export function parseDataExportFile(value: unknown): DataExportFile {
  if (typeof value !== 'object' || value === null) throw new Error('Not a data export file.')
  const record = value as Record<string, unknown>

  if (typeof record.exportedAt !== 'number' || typeof record.tables !== 'object' || record.tables === null) {
    throw new Error('Malformed data export file.')
  }

  if (record.version === 2) return upgradeV2(record)
  if (record.version === 3) return upgradeV3(record)
  if (record.version === 4 || record.version === 5 || record.version === 6) return upgradeV4(record)

  if (record.version !== DATA_EXPORT_VERSION) {
    throw new Error(`Unsupported data export version: ${String(record.version)}.`)
  }

  const tables = record.tables as Record<string, unknown>
  // `entries` and `tableDefs` are what make a v3 file a v3 file; the rest may legitimately
  // be absent in a file written by an older build of this same version.
  for (const key of ['tableDefs', 'entries'] as const) {
    if (!Array.isArray(tables[key])) throw new Error(`Malformed data export file: missing "${key}" table.`)
  }

  const normalised = Object.fromEntries(TABLE_KEYS.map((key) => [key, asRows(tables[key])])) as DataExportFile['tables']
  normalised.tableDefs = withInvestmentClasses(normalised.tableDefs)
  return { version: DATA_EXPORT_VERSION, exportedAt: record.exportedAt, tables: normalised }
}
