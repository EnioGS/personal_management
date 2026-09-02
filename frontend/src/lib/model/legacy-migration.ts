import type { LocalRow } from '@/lib/local-store/create-local-table'
import type { InvestmentClass, TableKind } from './types'

/** The five hardcoded tables the app shipped with before tables became user data. */
export const LEGACY_TABLE_KEYS = ['spending', 'income', 'variableIncome', 'fixedIncome', 'contributions'] as const
export type LegacyTableKey = (typeof LEGACY_TABLE_KEYS)[number]

interface LegacyMapping {
  name: string
  kind: TableKind
  investmentClass?: InvestmentClass
  /** Legacy field -> current field, for columns the new schema names differently. */
  rename?: Record<string, string>
}

/**
 * How each former hardcoded table becomes a table definition.
 *
 * Income's `source` becomes `category`: the two were the same idea under different
 * names, and folding them together means one category vocabulary (and one set of
 * category rules) covers money coming in as well as going out.
 */
export const LEGACY_TABLE_MAP: Record<LegacyTableKey, LegacyMapping> = {
  spending: { name: 'Gastos', kind: 'generic' },
  income: { name: 'Receitas', kind: 'generic', rename: { source: 'category' } },
  variableIncome: { name: 'Renda Variável', kind: 'investmentLedger', investmentClass: 'variableIncome' },
  fixedIncome: { name: 'Renda Fixa', kind: 'investmentLedger', investmentClass: 'fixedIncome' },
  contributions: { name: 'Aportes', kind: 'contributions' },
}

export type LegacyTables = Partial<Record<LegacyTableKey, LocalRow[]>>

export interface ModelRows {
  tableDefs: LocalRow[]
  entries: LocalRow[]
}

/**
 * Turns the old per-table rows into table definitions plus tagged entries.
 *
 * Pure and id-assigning, so the same mapping serves both the one-off migration of a
 * browser's existing data and the upgrade of a v2 export file on import. A legacy
 * table with no rows produces no definition — an empty install starts clean rather
 * than inheriting five tables it never used.
 */
export function buildModelFromLegacy(legacy: LegacyTables): ModelRows {
  const tableDefs: LocalRow[] = []
  const entries: LocalRow[] = []
  let nextTableId = 1
  let nextEntryId = 1

  for (const key of LEGACY_TABLE_KEYS) {
    const rows = legacy[key] ?? []
    if (rows.length === 0) continue

    const mapping = LEGACY_TABLE_MAP[key]
    const tableId = nextTableId++
    tableDefs.push({
      id: tableId,
      createdAt: rows[0]?.createdAt ?? Date.now(),
      data: { name: mapping.name, kind: mapping.kind, ...(mapping.investmentClass ? { investmentClass: mapping.investmentClass } : {}) },
    })

    for (const row of rows) {
      const source = (row.data ?? {}) as Record<string, unknown>
      const fields: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(source)) {
        fields[mapping.rename?.[field] ?? field] = value
      }
      entries.push({ id: nextEntryId++, createdAt: row.createdAt, data: { tableId, ...fields } })
    }
  }

  return { tableDefs, entries }
}
