import initSqlJs, { type Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { parseDataExportFile, type DataExportFile, type DataTableKey } from './data-file'
import { columnNames, createTableSql, insertSql, rowToSqlValues, sqlValuesToRow, SQLITE_SCHEMAS } from './sqlite-schema'
import type { LocalRow } from '@/lib/local-store/create-local-table'

/** SQLite's own magic header — every valid .db file starts with these 16 bytes. */
const SQLITE_MAGIC = 'SQLite format 3\0'

export function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false
  return String.fromCharCode(...bytes.slice(0, SQLITE_MAGIC.length)) === SQLITE_MAGIC
}

// One shared WASM instance — initSqlJs compiles/instantiates the module, which is not
// free; every export/import in a session reuses this instead of paying that cost twice.
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null
function getSqlJs() {
  if (!sqlJsPromise) sqlJsPromise = initSqlJs({ locateFile: () => sqlWasmUrl })
  return sqlJsPromise
}

/**
 * `DataExportFile` -> a real SQLite database's bytes, one table per entry in
 * `SQLITE_SCHEMAS` with typed columns instead of a JSON blob — openable in DB Browser
 * for SQLite, DBeaver, the `sqlite3` CLI, etc. See adr/0028.
 */
export async function buildSqliteFile(data: DataExportFile): Promise<Uint8Array> {
  const SQL = await getSqlJs()
  const db = new SQL.Database()
  try {
    // A one-row table carrying the export's own version/timestamp — parseSqliteFile
    // reads it back the same way parseDataExportFile reads a JSON file's top-level keys.
    db.run('CREATE TABLE "_export_meta" (version INTEGER NOT NULL, exported_at INTEGER NOT NULL)')
    db.run('INSERT INTO "_export_meta" (version, exported_at) VALUES (?, ?)', [data.version, data.exportedAt])

    for (const key of Object.keys(SQLITE_SCHEMAS) as DataTableKey[]) {
      const schema = SQLITE_SCHEMAS[key]
      db.run(createTableSql(schema))
      const stmt = db.prepare(insertSql(schema))
      try {
        for (const row of data.tables[key] ?? []) stmt.run(rowToSqlValues(schema, row))
      } finally {
        stmt.free()
      }
    }

    return db.export()
  } finally {
    db.close()
  }
}

function queryAll(db: Database, sql: string): (string | number | null)[][] {
  const stmt = db.prepare(sql)
  const rows: (string | number | null)[][] = []
  try {
    while (stmt.step()) rows.push(stmt.get() as (string | number | null)[])
  } finally {
    stmt.free()
  }
  return rows
}

/**
 * Older .db exports legitimately lack columns added after their creation. Select
 * NULL for those fields so they remain importable; the application's normal model
 * migration can then fill any required metadata such as investmentClass.
 */
function selectCompatibleRows(db: Database, schema: (typeof SQLITE_SCHEMAS)[DataTableKey]): (string | number | null)[][] {
  const available = new Set(queryAll(db, `PRAGMA table_info("${schema.sqlName}")`).map((row) => String(row[1])))
  // An export predating an additive app table does not contain that SQLite table at
  // all. Treat it as an empty app table so the data-file upgrader can restore it.
  if (available.size === 0) return []
  const columns = columnNames(schema).map((column) => (available.has(column) ? `"${column}"` : `NULL AS "${column}"`))
  return queryAll(db, `SELECT ${columns.join(', ')} FROM "${schema.sqlName}"`)
}

/** The reverse of `buildSqliteFile` — real SQLite bytes -> the same `DataExportFile` shape `importData` expects. */
export async function parseSqliteFile(bytes: Uint8Array): Promise<DataExportFile> {
  const SQL = await getSqlJs()
  const db = new SQL.Database(bytes)
  try {
    const [version, exportedAt] = queryAll(db, 'SELECT version, exported_at FROM "_export_meta" LIMIT 1')[0] ?? []
    if (typeof version !== 'number' || typeof exportedAt !== 'number') {
      throw new Error('Not a Personal Management .db export (missing _export_meta).')
    }

    const tables = {} as Record<DataTableKey, LocalRow[]>
    for (const key of Object.keys(SQLITE_SCHEMAS) as DataTableKey[]) {
      const schema = SQLITE_SCHEMAS[key]
      tables[key] = selectCompatibleRows(db, schema).map((values) => sqlValuesToRow(schema, values))
    }

    // SQLite exports use the same logical versioning as JSON exports. Running this
    // through the shared parser keeps old .db and .pmdata files on identical
    // upgrade paths, including empty new ingestion tables.
    return parseDataExportFile({ version, exportedAt, tables })
  } finally {
    db.close()
  }
}
