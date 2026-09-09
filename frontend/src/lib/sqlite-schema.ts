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
 * A source file's own columns are the one thing that cannot have a column each: every
 * file has different ones. They travel as JSON in `values_json` on `source_rows`, with
 * the file's header list beside them on `source_files` — the shape is per-file, so the
 * export keeps it per-file rather than inventing a union of every column ever seen.
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
      { column: 'limit_amount', key: 'limit', type: 'real' },
      { column: 'closing_day', key: 'closingDay', type: 'integer' },
      { column: 'due_day', key: 'dueDay', type: 'integer' },
      { column: 'archived', key: 'archived', type: 'boolean' },
    ],
  },
  budgets: {
    sqlName: 'budgets',
    columns: [
      { column: 'category', key: 'category', type: 'text' },
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
  sourceFiles: {
    sqlName: 'source_files',
    columns: [
      { column: 'original_filename', key: 'originalFilename', type: 'text' },
      { column: 'imported_at', key: 'importedAt', type: 'integer' },
      { column: 'raw_csv', key: 'rawCsv', type: 'text' },
      { column: 'original_columns', key: 'originalColumns', type: 'json' },
      { column: 'assignments', key: 'assignments', type: 'json' },
      { column: 'sign_convention', key: 'signConvention', type: 'json' },
      { column: 'looks_like_source_id', key: 'looksLikeSourceId', type: 'integer' },
    ],
  },
  sourceRows: {
    sqlName: 'source_rows',
    columns: [
      { column: 'source_id', key: 'sourceId', type: 'integer' },
      { column: 'row_id', key: 'rowId', type: 'text' },
      { column: 'values_json', key: 'values', type: 'json' },
      { column: 'labels', key: 'labels', type: 'json' },
      { column: 'marked_for_elimination', key: 'markedForElimination', type: 'boolean' },
      { column: 'applied_rule_ids', key: 'appliedRuleIds', type: 'json' },
      { column: 'duplicate_of', key: 'duplicateOf', type: 'text' },
      { column: 'imported_value', key: 'importedValue', type: 'text' },
    ],
  },
  confirmedRows: {
    sqlName: 'confirmed_rows',
    columns: [
      { column: 'row_id', key: 'rowId', type: 'text' },
      { column: 'section', key: 'section', type: 'text' },
      { column: 'screen', key: 'screen', type: 'text' },
      { column: 'confirmed_at', key: 'confirmedAt', type: 'integer' },
      { column: 'date', key: 'date', type: 'integer' },
      { column: 'value', key: 'value', type: 'real' },
      { column: 'observations', key: 'observations', type: 'text' },
      { column: 'class', key: 'class', type: 'text' },
      { column: 'category', key: 'category', type: 'text' },
      { column: 'subcategory', key: 'subcategory', type: 'text' },
      { column: 'amount', key: 'amount', type: 'real' },
      { column: 'price', key: 'price', type: 'real' },
      { column: 'account', key: 'account', type: 'text' },
      { column: 'card', key: 'card', type: 'text' },
      { column: 'marked_for_elimination', key: 'markedForElimination', type: 'boolean' },
    ],
  },
  profileUsage: {
    sqlName: 'profile_usage',
    columns: [
      { column: 'profile', key: 'profile', type: 'text' },
      { column: 'provider', key: 'provider', type: 'text' },
      { column: 'model', key: 'model', type: 'text' },
      { column: 'messages', key: 'messages', type: 'integer' },
      { column: 'requests', key: 'requests', type: 'integer' },
      { column: 'tokens', key: 'tokens', type: 'integer' },
      { column: 'prompt_tokens', key: 'promptTokens', type: 'integer' },
      { column: 'completion_tokens', key: 'completionTokens', type: 'integer' },
      { column: 'cached_tokens', key: 'cachedTokens', type: 'integer' },
      { column: 'reasoning_tokens', key: 'reasoningTokens', type: 'integer' },
      { column: 'peak_prompt_tokens', key: 'peakPromptTokens', type: 'integer' },
      { column: 'cost', key: 'cost', type: 'real' },
      { column: 'elapsed_ms', key: 'elapsedMs', type: 'integer' },
      { column: 'tool_ms', key: 'toolMs', type: 'integer' },
      { column: 'tool_calls', key: 'toolCalls', type: 'integer' },
      { column: 'tool_errors', key: 'toolErrors', type: 'integer' },
      { column: 'toolsets_opened', key: 'toolsetsOpened', type: 'integer' },
      { column: 'failures', key: 'failures', type: 'integer' },
      { column: 'slowest_ms', key: 'slowestMs', type: 'integer' },
      { column: 'reply_chars', key: 'replyChars', type: 'integer' },
      { column: 'first_used_at', key: 'firstUsedAt', type: 'integer' },
      { column: 'last_used_at', key: 'lastUsedAt', type: 'integer' },
      { column: 'tools', key: 'tools', type: 'json' },
    ],
  },
  assistantProfiles: {
    sqlName: 'assistant_profiles',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'is_active', key: 'isActive', type: 'boolean' },
      { column: 'overrides', key: 'overrides', type: 'json' },
      // The keys and models it sends under travel with it: a profile restored without
      // them would open disconnected, which is not the profile that was exported.
      { column: 'connections', key: 'connections', type: 'json' },
    ],
  },
  agentMemory: {
    sqlName: 'agent_memory',
    columns: [
      { column: 'context', key: 'context', type: 'text' },
      { column: 'title', key: 'title', type: 'text' },
      { column: 'text', key: 'text', type: 'text' },
      { column: 'scope', key: 'scope', type: 'json' },
      { column: 'created_by', key: 'createdBy', type: 'text' },
      // Every table already carries a created_at of its own; this is the note's.
      { column: 'note_created_at', key: 'createdAt', type: 'integer' },
      { column: 'edited_by', key: 'editedBy', type: 'text' },
      { column: 'edited_at', key: 'editedAt', type: 'integer' },
    ],
  },
  labelRules: {
    sqlName: 'label_rules',
    columns: [
      { column: 'name', key: 'name', type: 'text' },
      { column: 'context', key: 'context', type: 'text' },
      { column: 'field', key: 'field', type: 'text' },
      { column: 'contains', key: 'contains', type: 'text' },
      { column: 'match_mode', key: 'match', type: 'text' },
      { column: 'case_sensitive', key: 'caseSensitive', type: 'boolean' },
      { column: 'where_json', key: 'where', type: 'json' },
      { column: 'labels', key: 'labels', type: 'json' },
      { column: 'rationale', key: 'rationale', type: 'text' },
      { column: 'created_by', key: 'createdBy', type: 'text' },
      // Not 'created_at': every table already has one of its own for the stored row, and
      // two columns of one name is not a table SQLite will create.
      { column: 'rule_created_at', key: 'createdAt', type: 'integer' },
      { column: 'edited_by', key: 'editedBy', type: 'text' },
      { column: 'edited_at', key: 'editedAt', type: 'integer' },
    ],
  },
  classificationNotes: {
    sqlName: 'classification_notes',
    columns: [
      { column: 'context', key: 'context', type: 'text' },
      { column: 'title', key: 'title', type: 'text' },
      { column: 'text', key: 'text', type: 'text' },
      { column: 'scope', key: 'scope', type: 'json' },
      { column: 'created_by', key: 'createdBy', type: 'text' },
      { column: 'note_created_at', key: 'createdAt', type: 'integer' },
      { column: 'edited_by', key: 'editedBy', type: 'text' },
      { column: 'edited_at', key: 'editedAt', type: 'integer' },
    ],
  },
  ingestionAuditEvents: {
    sqlName: 'ingestion_audit_events',
    columns: [
      { column: 'event', key: 'event', type: 'text' },
      { column: 'actor', key: 'actor', type: 'text' },
      { column: 'source_id', key: 'sourceId', type: 'integer' },
      { column: 'details', key: 'details', type: 'json' },
    ],
  },
  notes: {
    sqlName: 'notes',
    columns: [
      { column: 'title', key: 'title', type: 'text' },
      { column: 'body', key: 'body', type: 'text' },
      { column: 'updated_at', key: 'updatedAt', type: 'integer' },
    ],
  },
  conversations: {
    sqlName: 'conversations',
    columns: [
      { column: 'title', key: 'title', type: 'text' },
      { column: 'messages', key: 'messages', type: 'json' },
      { column: 'updated_at', key: 'updatedAt', type: 'integer' },
    ],
  },
  usageTotals: {
    sqlName: 'usage_totals',
    columns: [
      { column: 'tokens', key: 'tokens', type: 'integer' },
      { column: 'requests', key: 'requests', type: 'integer' },
      { column: 'cost', key: 'cost', type: 'real' },
      { column: 'messages', key: 'messages', type: 'integer' },
    ],
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
  preferences: {
    sqlName: 'preferences',
    columns: [
      { column: 'key', key: 'key', type: 'text' },
      { column: 'value', key: 'value', type: 'text' },
    ],
  },
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
