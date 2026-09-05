import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import {
  accountsTable,
  allocationTargetsTable,
  budgetsTable,
  cardsTable,
  classificationNotesTable,
  confirmedRowsTable,
  ingestionAuditEventsTable,
  labelRulesTable,
  sourceFilesTable,
  sourceRowsTable,
} from '@/lib/model/model-db'
import { assistantProfilesTable, conversationsTable, profileUsageTable, usageTotalsTable } from '@/lib/chat/conversations-db'
import { preferencesTable } from '@/lib/preferences-table'
import { notesTable } from '@/sections/notes/notes-db'

/**
 * v8 is the first export of the one-phase model, and the first that mirrors the
 * database instead of a fixed list of stores. Earlier files describe a world of staged
 * rows, entries and table definitions that no longer exists, and are refused with an
 * explanation rather than half-restored.
 */
export const DATA_EXPORT_VERSION = 8 as const
export const DATA_FILE_NAME = 'personal-management-data.db'
export const DATA_FILE_EXTENSION = '.db'
/** Still accepted on import (see `data-panel.tsx`) — a backup made before adr/0028. */
export const LEGACY_DATA_FILE_EXTENSION = '.pmdata'

/** Everything that round-trips. Key order here is the order tables are cleared/restored. */
/**
 * Everything that round-trips, in the order tables are cleared and restored.
 *
 * The export mirrors the database rather than a fixed shape of its own: a source file
 * and a confirmed table appear under their own names, so the `.db` is worth opening in
 * a SQLite browser — which was the point of exporting SQLite at all.
 */
const TABLES = {
  accounts: accountsTable,
  cards: cardsTable,
  budgets: budgetsTable,
  allocationTargets: allocationTargetsTable,
  sourceFiles: sourceFilesTable,
  sourceRows: sourceRowsTable,
  confirmedRows: confirmedRowsTable,
  labelRules: labelRulesTable,
  classificationNotes: classificationNotesTable,
  ingestionAuditEvents: ingestionAuditEventsTable,
  notes: notesTable,
  conversations: conversationsTable,
  usageTotals: usageTotalsTable,
  profileUsage: profileUsageTable,
  assistantProfiles: assistantProfilesTable,
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
const SETUP_TABLES: DataTableKey[] = ['accounts', 'cards', 'preferences']

/** Clears the data while keeping the setup. This is what the Vault's clear button does. */
export async function clearStoredData(): Promise<void> {
  await Promise.all(TABLE_KEYS.filter((key) => !SETUP_TABLES.includes(key)).map((key) => TABLES[key].clear()))
  await refreshAllLocalStores()
}

export interface ImportReport {
  /** Stores the file did not carry at all; they come back empty rather than missing. */
  absentStores: DataTableKey[]
  /** Stores the file carried that this version knows nothing about — kept in the file, not imported. */
  unknownStores: string[]
  /** Tables beyond the ones each screen needs. They are imported and kept. */
  extraTables: string[]
}

/**
 * What a file will and will not bring in, worked out before anything is written.
 *
 * A file from an older build simply lacks stores this one has; a file from a newer one
 * carries stores it does not. Neither is a reason to refuse it: the first are restored
 * empty, the second stay in the file and are named, so nothing disappears without being
 * mentioned.
 */
export function describeImport(file: DataExportFile, knownKeys: readonly string[] = TABLE_KEYS): ImportReport {
  const carried = Object.keys(file.tables ?? {})
  const sourceFiles = (file.tables?.sourceFiles ?? []).map((row) => (row.data as { originalFilename?: string })?.originalFilename ?? 'unnamed')
  return {
    absentStores: TABLE_KEYS.filter((key) => !carried.includes(key)),
    unknownStores: carried.filter((key) => !knownKeys.includes(key)),
    extraTables: sourceFiles,
  }
}

/**
 * Replaces everything in this browser with what the file holds.
 *
 * A replace, not a merge: rows carry their own ids, so merging two exports would either
 * collide on those ids or silently renumber rows that other rows point at. Stores the
 * file does not carry end up empty, which is what "this is now that file" means.
 */
export async function importData(file: DataExportFile): Promise<ImportReport> {
  const report = describeImport(file)
  for (const key of TABLE_KEYS) {
    const table = TABLES[key]
    await table.clear()
    const rows = file.tables[key] ?? []
    if (rows.length > 0) await table.bulkPut(rows)
  }
  await refreshAllLocalStores()
  return report
}

/**
 * Reads an export this app can restore.
 *
 * Files written before the one-phase model describe staged rows, entries and table
 * definitions that no longer exist. Half-restoring one would leave a vault that looks
 * populated and reads empty, so they are refused with the reason.
 */
export function parseDataExportFile(value: unknown): DataExportFile {
  if (typeof value !== 'object' || value === null) throw new Error('Not a data export file.')
  const record = value as Record<string, unknown>

  if (typeof record.exportedAt !== 'number' || typeof record.tables !== 'object' || record.tables === null) {
    throw new Error('Malformed data export file.')
  }
  if (record.version !== DATA_EXPORT_VERSION) {
    throw new Error(
      `This file was written by version ${String(record.version)} of the data format, and this app reads version ${DATA_EXPORT_VERSION}. `
      + 'Versions before 8 describe staged rows and table definitions the app no longer has.',
    )
  }

  const tables = record.tables as Record<string, unknown>
  const normalised = Object.fromEntries(TABLE_KEYS.map((key) => [key, asRows(tables[key])])) as DataExportFile['tables']
  return { version: DATA_EXPORT_VERSION, exportedAt: record.exportedAt, tables: normalised }
}

function asRows(value: unknown): LocalRow[] {
  return Array.isArray(value) ? (value as LocalRow[]) : []
}
