import type { LocalRow } from '@/lib/local-store/create-local-table'
import type { DataTableKey } from './data-file'

export type SqliteColumnType = 'text' | 'integer' | 'real' | 'boolean' | 'json'

export interface SqliteColumn {
  /** snake_case column name — SQLite tooling (DB Browser, sqlite3, DBeaver...) shows this. */
  column: string
  /** camelCase key this column round-trips to/from inside the row's `data` object. */
  key: string
  type: SqliteColumnType
}

export interface SqliteTableSchema {
  /** snake_case table name. */
  sqlName: string
  columns: SqliteColumn[]
}

/**
 * One real SQLite table per app table, with a real typed column per known field —
 * openable and queryable in DB Browser for SQLite, DBeaver, the `sqlite3` CLI, etc.,
 * not just a blob column wearing a SQL file extension. See adr/0028.
 *
 * `entries` is the one exception worth calling out: `Entry` rows are deliberately
 * dynamic (adr/0022 — the column set is fixed per `TableKind`, not per app), so this
 * lists every field any current `TableKind` schema uses (table-kinds.ts) as one wide,
 * mostly-NULL table rather than a normalized-per-kind design that would need its own
 * migration every time a table kind gains a field. Update this list alongside
 * table-kinds.ts when a kind introduces a genuinely new column.
 */
export const SQLITE_SCHEMAS: Record<DataTableKey, SqliteTableSchema> = {
  accounts: {
    sqlName: 'accounts',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'kind', key: 'kind', type: 'text' },
      { column: 'institution', key: 'institution', type: 'text' },
      { column: 'archived', key: 'archived', type: 'boolean' },
    ],
  },
  cards: {
    sqlName: 'cards',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'account_id', key: 'accountId', type: 'integer' },
      { column: 'card_limit', key: 'limit', type: 'real' },
      { column: 'closing_day', key: 'closingDay', type: 'integer' },
      { column: 'due_day', key: 'dueDay', type: 'integer' },
      { column: 'archived', key: 'archived', type: 'boolean' },
    ],
  },
  tableDefs: {
    sqlName: 'table_defs',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'kind', key: 'kind', type: 'text' },
      { column: 'account_id', key: 'accountId', type: 'integer' },
      { column: 'card_id', key: 'cardId', type: 'integer' },
      { column: 'investment_class', key: 'investmentClass', type: 'text' },
    ],
  },
  categories: {
    sqlName: 'categories',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'scope', key: 'scope', type: 'text' },
      { column: 'archived', key: 'archived', type: 'boolean' },
    ],
  },
  categoryRules: {
    sqlName: 'category_rules',
    columns: [
      { column: 'category_id', key: 'categoryId', type: 'integer' },
      { column: 'match', key: 'match', type: 'text' },
      { column: 'pattern', key: 'pattern', type: 'text' },
      { column: 'case_sensitive', key: 'caseSensitive', type: 'boolean' },
      { column: 'priority', key: 'priority', type: 'integer' },
      { column: 'scope', key: 'scope', type: 'text' },
    ],
  },
  entries: {
    sqlName: 'entries',
    columns: [
      { column: 'table_id', key: 'tableId', type: 'integer' },
      { column: 'deleted', key: 'deleted', type: 'boolean' },
      { column: 'import_key', key: 'importKey', type: 'text' },
      { column: 'date', key: 'date', type: 'integer' },
      { column: 'direction', key: 'direction', type: 'text' },
      { column: 'category', key: 'category', type: 'text' },
      { column: 'description', key: 'description', type: 'text' },
      { column: 'amount', key: 'amount', type: 'real' },
      { column: 'asset', key: 'asset', type: 'text' },
      { column: 'type', key: 'type', type: 'text' },
      { column: 'quantity', key: 'quantity', type: 'real' },
      { column: 'price', key: 'price', type: 'real' },
      { column: 'note', key: 'note', type: 'text' },
      { column: 'destination', key: 'destination', type: 'text' },
    ],
  },
  budgets: {
    sqlName: 'budgets',
    columns: [
      { column: 'category_id', key: 'categoryId', type: 'integer' },
      { column: 'monthly_amount', key: 'monthlyAmount', type: 'real' },
    ],
  },
  allocationTargets: {
    sqlName: 'allocation_targets',
    columns: [
      { column: 'asset', key: 'asset', type: 'text' },
      { column: 'target_percent', key: 'targetPercent', type: 'real' },
    ],
  },
  ingestionSources: {
    sqlName: 'ingestion_sources',
    columns: [
      { column: 'original_filename', key: 'originalFilename', type: 'text' },
      { column: 'source_fingerprint', key: 'sourceFingerprint', type: 'text' },
      { column: 'imported_at', key: 'importedAt', type: 'integer' },
      { column: 'raw_csv', key: 'rawCsv', type: 'text' },
      { column: 'original_columns', key: 'originalColumns', type: 'json' },
      { column: 'supplemental_columns', key: 'supplementalColumns', type: 'json' },
      { column: 'row_count', key: 'rowCount', type: 'integer' },
      { column: 'status', key: 'status', type: 'text' },
      { column: 'legacy', key: 'legacy', type: 'boolean' },
    ],
  },
  ingestionColumnMappings: {
    sqlName: 'ingestion_column_mappings',
    columns: [
      { column: 'source_id', key: 'sourceId', type: 'integer' },
      { column: 'source_column', key: 'sourceColumn', type: 'text' },
      { column: 'target_field', key: 'targetField', type: 'text' },
      { column: 'parser', key: 'parser', type: 'text' },
      { column: 'is_supplemental', key: 'isSupplemental', type: 'boolean' },
    ],
  },
  ingestionRows: {
    sqlName: 'ingestion_rows',
    columns: [
      { column: 'source_id', key: 'sourceId', type: 'integer' },
      { column: 'source_row_index', key: 'sourceRowIndex', type: 'integer' },
      { column: 'source_row_fingerprint', key: 'sourceRowFingerprint', type: 'text' },
      { column: 'raw_values', key: 'rawValues', type: 'json' },
      { column: 'mapped_values', key: 'mappedValues', type: 'json' },
      { column: 'labels', key: 'labels', type: 'json' },
      { column: 'status', key: 'status', type: 'text' },
      { column: 'validation_errors', key: 'validationErrors', type: 'json' },
      { column: 'destination_table_id', key: 'destinationTableId', type: 'integer' },
      { column: 'existing_entry_id', key: 'existingEntryId', type: 'integer' },
      { column: 'promoted_entry_id', key: 'promotedEntryId', type: 'integer' },
    ],
  },
  entryLabels: {
    sqlName: 'entry_labels',
    columns: [
      { column: 'entry_id', key: 'entryId', type: 'integer' },
      { column: 'finance_destinations', key: 'financeDestinations', type: 'json' },
      { column: 'flow_role', key: 'flowRole', type: 'text' },
      { column: 'settlement_channel', key: 'settlementChannel', type: 'text' },
      { column: 'spending_treatment', key: 'spendingTreatment', type: 'text' },
      { column: 'category_id', key: 'categoryId', type: 'integer' },
      { column: 'recurrence', key: 'recurrence', type: 'text' },
      { column: 'source_ingestion_row_id', key: 'sourceIngestionRowId', type: 'integer' },
    ],
  },
  ingestionAuditEvents: {
    sqlName: 'ingestion_audit_events',
    columns: [
      { column: 'event', key: 'event', type: 'text' },
      { column: 'actor', key: 'actor', type: 'text' },
      { column: 'source_id', key: 'sourceId', type: 'integer' },
      { column: 'ingestion_row_ids', key: 'ingestionRowIds', type: 'json' },
      { column: 'entry_ids', key: 'entryIds', type: 'json' },
      { column: 'details', key: 'details', type: 'json' },
    ],
  },
  notes: {
    sqlName: 'notes',
    columns: [{ column: 'text', key: 'text', type: 'text' }],
  },
  assistantPrompts: {
    sqlName: 'assistant_prompts',
    columns: [
      { column: 'key', key: 'key', type: 'text' },
      { column: 'content', key: 'content', type: 'text' },
    ],
  },
  assistantConfig: {
    sqlName: 'assistant_config',
    columns: [
      { column: 'provider', key: 'provider', type: 'text' },
      { column: 'api_key', key: 'apiKey', type: 'text' },
      { column: 'model', key: 'model', type: 'text' },
      { column: 'is_active', key: 'isActive', type: 'boolean' },
    ],
  },
}

function encodeValue(value: unknown, type: SqliteColumnType): string | number | null {
  if (value === undefined || value === null) return null
  if (type === 'boolean') return value ? 1 : 0
  if (type === 'integer' || type === 'real') return typeof value === 'number' ? value : Number(value)
  if (type === 'json') return JSON.stringify(value)
  return String(value)
}

function decodeValue(value: string | number | null, type: SqliteColumnType): unknown {
  if (value === null || value === undefined) return undefined
  if (type === 'boolean') return value === 1 || value === '1'
  if (type === 'integer' || type === 'real') return typeof value === 'number' ? value : Number(value)
  if (type === 'json') {
    try {
      return JSON.parse(String(value))
    } catch {
      return undefined
    }
  }
  return String(value)
}

/** `id, created_at, <one column per field>` — the fixed column order every helper below assumes. */
export function columnNames(schema: SqliteTableSchema): string[] {
  return ['id', 'created_at', ...schema.columns.map((c) => c.column)]
}

export function createTableSql(schema: SqliteTableSchema): string {
  const cols = schema.columns.map((c) => `"${c.column}" ${sqlType(c.type)}`).join(', ')
  return `CREATE TABLE "${schema.sqlName}" (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, ${cols})`
}

function sqlType(type: SqliteColumnType): string {
  if (type === 'integer' || type === 'boolean') return 'INTEGER'
  if (type === 'real') return 'REAL'
  return 'TEXT'
}

export function insertSql(schema: SqliteTableSchema): string {
  const cols = columnNames(schema)
  const placeholders = cols.map(() => '?').join(', ')
  return `INSERT INTO "${schema.sqlName}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
}

export function selectAllSql(schema: SqliteTableSchema): string {
  return `SELECT ${columnNames(schema)
    .map((c) => `"${c}"`)
    .join(', ')} FROM "${schema.sqlName}"`
}

/** A `LocalRow` -> the positional bind values `insertSql`'s placeholders expect, in order. */
export function rowToSqlValues(schema: SqliteTableSchema, row: LocalRow): (string | number | null)[] {
  const data = (row.data ?? {}) as Record<string, unknown>
  return [row.id, row.createdAt, ...schema.columns.map((c) => encodeValue(data[c.key], c.type))]
}

/** The reverse of `rowToSqlValues` — one result row (in `columnNames` order) -> a `LocalRow`. */
export function sqlValuesToRow(schema: SqliteTableSchema, values: (string | number | null)[]): LocalRow {
  const [id, createdAt, ...rest] = values
  const data: Record<string, unknown> = {}
  schema.columns.forEach((c, i) => {
    const decoded = decodeValue(rest[i], c.type)
    if (decoded !== undefined) data[c.key] = decoded
  })
  return { id: Number(id), createdAt: Number(createdAt), data }
}
