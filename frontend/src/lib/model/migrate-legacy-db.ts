import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { contributionsTable } from '@/sections/investments/contributions-db'
import { fixedIncomeTable } from '@/sections/investments/fixed-income-db'
import { variableIncomeTable } from '@/sections/investments/variable-income-db'
import { incomeTable } from '@/sections/finances/income-db'
import { spendingTable } from '@/sections/finances/spending-db'
import { buildModelFromLegacy, type LegacyTables } from './legacy-migration'
import { entriesTable, tableDefsTable } from './model-db'

/**
 * Set once the browser's pre-existing rows have been folded into the model. Kept in
 * localStorage rather than the database on purpose: it describes *this install's*
 * history, not the user's data, so it must not travel in an export — a v3 file
 * imported elsewhere already contains fully-migrated content.
 */
const MIGRATED_KEY = 'pm.legacyMigratedAt'

const LEGACY_TABLES = {
  spending: spendingTable,
  income: incomeTable,
  variableIncome: variableIncomeTable,
  fixedIncome: fixedIncomeTable,
  contributions: contributionsTable,
} as const

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) !== null
  } catch {
    // Private mode / storage disabled: treat as migrated so we never loop on failure.
    return true
  }
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
  } catch {
    /* nothing we can do, and not worth failing the app over */
  }
}

/**
 * Moves data written before tables were user-configurable into the new model, once.
 *
 * Additive: it only writes when the model has no tables of its own yet, and it leaves
 * the legacy databases untouched, so a failure here costs nothing and the old rows
 * remain recoverable. Runs at startup (see main.tsx).
 */
export async function migrateLegacyData(): Promise<void> {
  if (alreadyMigrated()) return

  // Never migrate on top of an existing model — that would duplicate tables for anyone
  // who has already created their own, or who just imported a file.
  if ((await tableDefsTable.count()) > 0) {
    markMigrated()
    return
  }

  const legacy: LegacyTables = {}
  for (const [key, table] of Object.entries(LEGACY_TABLES)) {
    legacy[key as keyof typeof LEGACY_TABLES] = await table.toArray()
  }

  const { tableDefs, entries } = buildModelFromLegacy(legacy)
  if (tableDefs.length === 0) {
    markMigrated()
    return
  }

  await tableDefsTable.bulkPut(tableDefs)
  await entriesTable.bulkPut(entries)
  markMigrated()
  await refreshAllLocalStores()
}
