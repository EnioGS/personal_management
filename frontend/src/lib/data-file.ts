import { assistantConfigTable } from '@/lib/assistant-config-db'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { contributionsTable } from '@/sections/investments/contributions-db'
import { fixedIncomeTable } from '@/sections/investments/fixed-income-db'
import { variableIncomeTable } from '@/sections/investments/variable-income-db'
import { incomeTable } from '@/sections/finances/income-db'
import { spendingTable } from '@/sections/finances/spending-db'
import { notesTable } from '@/sections/notes/notes-db'

/** v1 was the encrypted (.pmvault) format — unreadable now, so it is rejected on import. */
export const DATA_EXPORT_VERSION = 2 as const
export const DATA_FILE_NAME = 'personal-management-data.pmdata'
export const DATA_FILE_EXTENSION = '.pmdata'

const TABLES = {
  spending: spendingTable,
  income: incomeTable,
  variableIncome: variableIncomeTable,
  fixedIncome: fixedIncomeTable,
  contributions: contributionsTable,
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

/** Total rows across every table — drives the "what's stored here" summary in Get Started. */
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
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].bulkPut(file.tables[key])))
  await refreshAllLocalStores()
}

/** Throws a descriptive Error if `value` isn't a well-formed, current-version export. */
export function parseDataExportFile(value: unknown): DataExportFile {
  if (typeof value !== 'object' || value === null) throw new Error('Not a data export file.')
  const record = value as Record<string, unknown>
  if (record.version !== DATA_EXPORT_VERSION) {
    throw new Error(`Unsupported data export version: ${String(record.version)}.`)
  }
  if (typeof record.exportedAt !== 'number' || typeof record.tables !== 'object' || record.tables === null) {
    throw new Error('Malformed data export file.')
  }
  const tables = record.tables as Record<string, unknown>
  for (const key of TABLE_KEYS) {
    if (!Array.isArray(tables[key])) throw new Error(`Malformed data export file: missing "${key}" table.`)
  }
  return value as DataExportFile
}
