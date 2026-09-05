import initSqlJs, { type Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { confirmedRowsTable, labelRulesTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import type { ConfirmedRow, SourceFile, SourceRow } from '@/lib/model/types'

/**
 * SQL over the browser's data.
 *
 * Storage stays Dexie; SQLite is built here, in memory, from the live stores each time a
 * statement runs. That keeps one source of truth and makes every query see the current
 * state, at the cost of a rebuild per call — milliseconds for a vault this size, and
 * worth paying to avoid two copies of the data disagreeing.
 *
 * The tables are the ones a person would expect: one per source file under its own name,
 * one per (section, screen) pair holding confirmed rows, plus the standing rules.
 */
let sqlJs: ReturnType<typeof initSqlJs> | null = null

function slug(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'file'
}

export function sourceTableName(file: SourceFile, id: number): string {
  return `source__${slug(file.originalFilename)}__${id}`
}

export function confirmedTableName(section: string, screen: string): string {
  return `confirmed__${slug(section)}__${slug(screen)}`
}

function quote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

function createAndFill(db: Database, table: string, rows: Record<string, unknown>[], columns: string[]) {
  const quoted = columns.map((column) => `"${column}"`).join(', ')
  db.run(`CREATE TABLE "${table}" (${quoted})`)
  for (const row of rows) {
    db.run(`INSERT INTO "${table}" (${quoted}) VALUES (${columns.map((column) => quote(row[column])).join(', ')})`)
  }
}

export interface VaultTable {
  name: string
  columns: string[]
  rows: number
  /**
   * For a confirmed table: how its amounts are signed today. This is the reference a
   * sign decision is measured against — recorded from the data itself rather than
   * declared somewhere that can go stale.
   */
  signs?: { negative: number; positive: number }
}

export interface VaultSnapshot {
  db: Database
  tables: VaultTable[]
}

/** Builds the queryable picture of the vault as it stands right now. */
export async function buildVaultSnapshot(): Promise<VaultSnapshot> {
  sqlJs ??= initSqlJs({ locateFile: () => sqlWasmUrl })
  const SQL = await sqlJs
  const db = new SQL.Database()
  const tables: VaultTable[] = []

  const [files, sourceRows, confirmedRows, rules] = await Promise.all([
    sourceFilesTable.toArray(), sourceRowsTable.toArray(), confirmedRowsTable.toArray(), labelRulesTable.toArray(),
  ])

  for (const stored of files) {
    const file = stored.data as SourceFile
    const rows = sourceRows
      .map((row) => ({ id: row.id, data: row.data as SourceRow }))
      .filter((row) => row.data.sourceId === stored.id)
      .map(({ id, data }) => ({
        id,
        row_id: data.rowId,
        ...data.values,
        sections: (data.labels.sections ?? []).join(', '),
        screens: (data.labels.screens ?? []).join(', '),
        category: data.labels.category ?? '',
        subcategory: data.labels.subcategory ?? '',
        marked_for_elimination: data.markedForElimination ? 1 : 0,
        duplicate_of: data.duplicateOf ?? null,
      }))
    const columns = ['id', 'row_id', 'source_filename', ...file.originalColumns, 'sections', 'screens', 'category', 'subcategory', 'marked_for_elimination', 'duplicate_of']
    const name = sourceTableName(file, stored.id)
    createAndFill(db, name, rows, columns)
    tables.push({ name, columns, rows: rows.length })
  }

  const byPlacement = new Map<string, { id: number; data: ConfirmedRow }[]>()
  for (const stored of confirmedRows) {
    const row = stored.data as ConfirmedRow
    const key = confirmedTableName(row.section, row.screen)
    byPlacement.set(key, [...(byPlacement.get(key) ?? []), { id: stored.id, data: row }])
  }
  const confirmedColumns = ['id', 'row_id', 'section', 'screen', 'source_filename', 'date', 'amount', 'observations', 'category', 'subcategory', 'asset', 'quantity', 'price', 'investment_type', 'investment_class', 'marked_for_elimination']
  for (const [name, rows] of byPlacement) {
    createAndFill(db, name, rows.map(({ id, data }) => ({
      id,
      row_id: data.rowId,
      section: data.section,
      screen: data.screen,
      source_filename: data.sourceFilename,
      date: data.date ?? null,
      amount: data.amount ?? null,
      observations: data.observations,
      category: data.category,
      subcategory: data.subcategory,
      asset: data.asset ?? null,
      quantity: data.quantity ?? null,
      price: data.price ?? null,
      investment_type: data.investmentType ?? null,
      investment_class: data.investmentClass ?? null,
      marked_for_elimination: data.markedForElimination ? 1 : 0,
    })), confirmedColumns)
    tables.push({
      name,
      columns: confirmedColumns,
      rows: rows.length,
      signs: {
        negative: rows.filter(({ data }) => typeof data.amount === 'number' && data.amount < 0).length,
        positive: rows.filter(({ data }) => typeof data.amount === 'number' && data.amount > 0).length,
      },
    })
  }

  const ruleColumns = ['id', 'name', 'context', 'field', 'contains', 'match_mode', 'labels', 'rationale', 'created_by']
  createAndFill(db, 'label_rules', rules.map((stored) => {
    const rule = stored.data as Record<string, unknown>
    return {
      id: stored.id,
      name: rule.name ?? rule.contains,
      context: rule.context,
      field: rule.field,
      contains: rule.contains,
      match_mode: rule.match ?? 'contains',
      labels: JSON.stringify(rule.labels ?? {}),
      rationale: rule.rationale ?? '',
      created_by: rule.createdBy,
    }
  }), ruleColumns)
  tables.push({ name: 'label_rules', columns: ruleColumns, rows: rules.length })

  return { db, tables }
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
}

const MAX_ROWS = 200

/** Runs one read statement. Anything that would write is refused before it runs. */
export async function queryVault(statement: string): Promise<QueryResult> {
  const trimmed = statement.trim().replace(/;+\s*$/, '')
  if (/;/.test(trimmed)) throw new Error('One statement at a time.')
  if (!/^(select|with)\b/i.test(trimmed)) throw new Error('Only SELECT (or WITH … SELECT) can be read here. Changes go through the writing tools.')

  const snapshot = await buildVaultSnapshot()
  try {
    const result = snapshot.db.exec(trimmed)
    if (result.length === 0) return { columns: [], rows: [], rowCount: 0, truncated: false }
    const [{ columns, values }] = result
    return { columns, rows: values.slice(0, MAX_ROWS), rowCount: values.length, truncated: values.length > MAX_ROWS }
  } finally {
    snapshot.db.close()
  }
}

/** What tables exist and what they hold — the schema, read from the data itself. */
export async function describeVault(): Promise<VaultTable[]> {
  const snapshot = await buildVaultSnapshot()
  try {
    return snapshot.tables
  } finally {
    snapshot.db.close()
  }
}

/** Rows as objects rather than tuples, for callers that want to read them. */
export function rowsAsObjects(result: QueryResult): Record<string, unknown>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])))
}
