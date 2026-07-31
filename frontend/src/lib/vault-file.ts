import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { decryptJson } from '@/lib/crypto/envelope'
import type { EncryptedRow } from '@/lib/secure-store/create-encrypted-table'
import { contributionsTable } from '@/sections/investments/contributions-db'
import { fixedIncomeTable } from '@/sections/investments/fixed-income-db'
import { variableIncomeTable } from '@/sections/investments/variable-income-db'
import { incomeTable } from '@/sections/finances/income-db'
import { spendingTable } from '@/sections/finances/spending-db'
import { notesTable } from '@/sections/notes/secure-db'

export const VAULT_EXPORT_VERSION = 1 as const
export const VAULT_FILE_NAME = 'personal-management-vault.pmvault'

const TABLES = {
  spending: spendingTable,
  income: incomeTable,
  variableIncome: variableIncomeTable,
  fixedIncome: fixedIncomeTable,
  contributions: contributionsTable,
  notes: notesTable,
  assistantPrompts: assistantPromptsTable,
} as const

export type VaultTableKey = keyof typeof TABLES

export interface VaultExportFile {
  version: typeof VAULT_EXPORT_VERSION
  exportedAt: number
  tables: Record<VaultTableKey, EncryptedRow[]>
}

const TABLE_KEYS = Object.keys(TABLES) as VaultTableKey[]

export async function hasAnyData(): Promise<boolean> {
  const counts = await Promise.all(TABLE_KEYS.map((key) => TABLES[key].count()))
  return counts.some((count) => count > 0)
}

export async function exportVaultData(): Promise<VaultExportFile> {
  const entries = await Promise.all(TABLE_KEYS.map(async (key) => [key, await TABLES[key].toArray()] as const))
  return {
    version: VAULT_EXPORT_VERSION,
    exportedAt: Date.now(),
    tables: Object.fromEntries(entries) as VaultExportFile['tables'],
  }
}

export async function wipeVaultData(): Promise<void> {
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].clear()))
}

/** Wipes all tables, then restores the imported rows — bulkPut preserves their original ids. */
export async function importVaultData(file: VaultExportFile): Promise<void> {
  await wipeVaultData()
  await Promise.all(TABLE_KEYS.map((key) => TABLES[key].bulkPut(file.tables[key])))
}

/** Throws a descriptive Error if `value` isn't a well-formed, version-1 vault export. */
export function parseVaultExportFile(value: unknown): VaultExportFile {
  if (typeof value !== 'object' || value === null) throw new Error('Not a vault export file.')
  const record = value as Record<string, unknown>
  if (record.version !== VAULT_EXPORT_VERSION) {
    throw new Error(`Unsupported vault export version: ${String(record.version)}.`)
  }
  if (typeof record.exportedAt !== 'number' || typeof record.tables !== 'object' || record.tables === null) {
    throw new Error('Malformed vault export file.')
  }
  const tables = record.tables as Record<string, unknown>
  for (const key of TABLE_KEYS) {
    if (!Array.isArray(tables[key])) throw new Error(`Malformed vault export file: missing "${key}" table.`)
  }
  return value as VaultExportFile
}

/** Picks any one row from the live DB to verify a passphrase against — content doesn't matter, only that decryption succeeds. */
export async function getAnyRowFromTables(): Promise<EncryptedRow | null> {
  for (const key of TABLE_KEYS) {
    const [row] = await TABLES[key].limit(1).toArray()
    if (row) return row
  }
  return null
}

/** Same as getAnyRowFromTables, against an already-parsed export file instead of the live DB. */
export function getAnyRowFromExport(file: VaultExportFile): EncryptedRow | null {
  for (const key of TABLE_KEYS) {
    const [row] = file.tables[key]
    if (row) return row
  }
  return null
}

/** Wraps decryptJson: returns false instead of throwing on a wrong passphrase or corrupt data. */
export async function verifyPassphraseAgainstRow(passphrase: string, row: EncryptedRow): Promise<boolean> {
  try {
    await decryptJson(passphrase, row)
    return true
  } catch {
    return false
  }
}
