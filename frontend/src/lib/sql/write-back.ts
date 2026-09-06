import type { Database } from 'sql.js'
import { confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { resolveAccountLabel, resolveCardLabel, resolveScreenLabel, resolveSectionLabel } from '@/lib/model/label-catalogue'
import { beginTurn, endTurn } from '@/lib/journal/journal'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { buildVaultSnapshot } from './query-vault'
import type { ConfirmedRow, SourceFile, SourceRow } from '@/lib/model/types'

export interface RowChange {
  table: string
  op: 'insert' | 'update' | 'delete'
  id: number | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface WritePlan {
  statement: string
  changes: RowChange[]
  /** What each table would gain, lose or have altered — the number a person reads first. */
  counts: Record<string, { insert: number; update: number; delete: number }>
  /** Anything the change would make untrue, which stops it being applied. */
  refusals: string[]
}

/**
 * What a statement would do, worked out by doing it to a copy.
 *
 * The vault is rebuilt from Dexie on every query, so a write there changes nothing real:
 * that copy is the safest possible place to find out what a statement means. The rows are
 * read before and after, and the difference between them is the plan — which is also why
 * this works for any statement at all, however it is phrased, without anybody parsing
 * what it intended.
 */
export async function planStatement(statement: string): Promise<WritePlan> {
  const { db, tables } = await buildVaultSnapshot()
  const writable = tables.filter((table) => table.name.startsWith('confirmed__') || table.name.startsWith('source__'))
  const before = new Map(writable.map((table) => [table.name, readTable(db, table.name)]))

  db.run(statement)

  const changes: RowChange[] = []
  for (const table of writable) {
    const was = before.get(table.name) ?? new Map()
    const now = readTable(db, table.name)

    for (const [id, row] of now) {
      const previous = was.get(id)
      if (previous === undefined) changes.push({ table: table.name, op: 'insert', id, before: null, after: row })
      else if (JSON.stringify(previous) !== JSON.stringify(row)) changes.push({ table: table.name, op: 'update', id, before: previous, after: row })
    }
    for (const [id, row] of was) {
      if (!now.has(id)) changes.push({ table: table.name, op: 'delete', id, before: row, after: null })
    }
  }
  db.close()

  const counts: WritePlan['counts'] = {}
  for (const change of changes) {
    const tally = counts[change.table] ?? { insert: 0, update: 0, delete: 0 }
    tally[change.op] += 1
    counts[change.table] = tally
  }

  return { statement, changes, counts, refusals: await refusalsFor(changes) }
}

/**
 * Applies a plan, or explains why it will not.
 *
 * One turn, so the whole statement is undone together; nothing is written if anything in
 * it is refused, because half a statement is a state nobody asked for.
 */
export async function applyStatement(statement: string): Promise<WritePlan & { applied: boolean }> {
  const plan = await planStatement(statement)
  if (plan.refusals.length > 0 || plan.changes.length === 0) return { ...plan, applied: false }

  beginTurn({ origin: 'sql', statement })
  try {
    for (const change of plan.changes) {
      const kind = change.table.startsWith('confirmed__') ? 'confirmed' : 'source'
      if (change.op === 'delete') {
        await (kind === 'confirmed' ? confirmedRowsTable : sourceRowsTable).delete(change.id as number)
        continue
      }
      if (kind === 'confirmed') await writeConfirmed(change)
      else await writeSource(change)
    }
  } finally {
    endTurn()
  }

  await refreshAllLocalStores()
  return { ...plan, applied: true }
}

/** Every row of a table, by id, as plain values. */
function readTable(db: Database, name: string): Map<number, Record<string, unknown>> {
  const rows = new Map<number, Record<string, unknown>>()
  const statement = db.prepare(`SELECT * FROM "${name}"`)
  while (statement.step()) {
    const row = statement.getAsObject() as Record<string, unknown>
    const id = typeof row.id === 'number' ? row.id : null
    // A row inserted by the statement has no id yet; it is keyed by its own contents so
    // that two of them are two rows rather than one overwriting the other.
    rows.set(id ?? -(rows.size + 1), row)
  }
  statement.free()
  return rows
}

/** Undoing the vault's projection: SQL columns back into the row the app stores. */
async function writeConfirmed(change: RowChange): Promise<void> {
  const after = change.after as Record<string, unknown>
  const existing = change.op === 'update' ? (await confirmedRowsTable.get(change.id as number))?.data as ConfirmedRow | undefined : undefined
  const row: ConfirmedRow = {
    ...(existing ?? ({} as ConfirmedRow)),
    rowId: String(after.row_id ?? existing?.rowId ?? crypto.randomUUID()),
    section: String(after.section ?? existing?.section ?? ''),
    screen: String(after.screen ?? existing?.screen ?? ''),
    confirmedAt: existing?.confirmedAt ?? Date.now(),
    observations: String(after.observations ?? existing?.observations ?? '{}'),
    category: String(after.category ?? ''),
    subcategory: String(after.subcategory ?? ''),
    ...optionalNumber('date', after.date),
    ...optionalNumber('value', after.value),
    ...optionalNumber('amount', after.amount),
    ...optionalNumber('price', after.price),
    ...optionalText('class', after.class),
    ...optionalText('account', after.account),
    ...optionalText('card', after.card),
    markedForElimination: after.marked_for_elimination === 1 || after.marked_for_elimination === true,
  }
  if (change.op === 'update') await confirmedRowsTable.update(change.id as number, { data: row })
  else await confirmedRowsTable.add({ createdAt: Date.now(), data: row })
}

async function writeSource(change: RowChange): Promise<void> {
  const after = change.after as Record<string, unknown>
  const stored = change.op === 'update' ? await sourceRowsTable.get(change.id as number) : undefined
  const existing = stored?.data as SourceRow | undefined
  if (change.op === 'update' && !existing) return

  // The file's own columns are whatever is left once the app's are taken out: a source
  // table is the file's columns and the labels, side by side.
  const labelColumns = new Set(['id', 'row_id', 'sections', 'screens', 'class', 'category', 'subcategory', 'account', 'card', 'marked_for_elimination', 'duplicate_of'])
  const values = { ...(existing?.values ?? {}) }
  for (const [column, value] of Object.entries(after)) {
    if (!labelColumns.has(column)) values[column] = value === null || value === undefined ? '' : String(value)
  }

  const row: SourceRow = {
    ...(existing ?? ({ sourceId: 0 } as SourceRow)),
    rowId: String(after.row_id ?? existing?.rowId ?? crypto.randomUUID()),
    values,
    labels: {
      ...(existing?.labels ?? {}),
      ...list('sections', after.sections),
      ...list('screens', after.screens),
      ...optionalText('class', after.class),
      ...optionalText('category', after.category),
      ...optionalText('subcategory', after.subcategory),
      ...optionalText('account', after.account),
      ...optionalText('card', after.card),
    },
    markedForElimination: after.marked_for_elimination === 1 || after.marked_for_elimination === true,
  }
  if (change.op === 'update') await sourceRowsTable.update(change.id as number, { data: row })
  else await sourceRowsTable.add({ createdAt: Date.now(), data: row })
}

function optionalNumber(key: string, value: unknown): Record<string, number | undefined> {
  if (value === null || value === undefined || value === '') return { [key]: undefined }
  const parsed = Number(value)
  return { [key]: Number.isFinite(parsed) ? parsed : undefined }
}

function optionalText(key: string, value: unknown): Record<string, string | undefined> {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return { [key]: text || undefined }
}

function list(key: string, value: unknown): Record<string, string[]> {
  const text = value === null || value === undefined ? '' : String(value)
  return { [key]: text.split(',').map((entry) => entry.trim()).filter(Boolean) }
}

/**
 * What a change would make untrue.
 *
 * Moved here from the tools deliberately: a rule checked inside one tool protects only the
 * writes that happened to go through it, and a rule checked here protects every write
 * however it arrived — the assistant's SQL, the user's, and whatever tools remain.
 */
async function refusalsFor(changes: RowChange[]): Promise<string[]> {
  const written = changes.filter((change) => change.after !== null)
  if (written.length === 0) return []

  const catalogue = await loadLabelCatalogue((key) => key)
  const refusals = new Set<string>()

  for (const change of written) {
    const after = change.after as Record<string, unknown>
    const text = (key: string) => (after[key] === null || after[key] === undefined ? '' : String(after[key]).trim())

    if (text('account') && !resolveAccountLabel(catalogue, text('account'))) {
      refusals.add(`No account is called "${text('account')}". Register it first.`)
    }
    if (text('card') && !resolveCardLabel(catalogue, text('card'))) {
      refusals.add(`No card is called "${text('card')}". Register it first.`)
    }
    for (const section of text('sections').split(',').map((entry) => entry.trim()).filter(Boolean)) {
      if (!resolveSectionLabel(catalogue, section)) refusals.add(`No section is called "${section}".`)
    }
    if (change.table.startsWith('confirmed__')) {
      if (text('section') && !resolveSectionLabel(catalogue, text('section'))) refusals.add(`No section is called "${text('section')}".`)
      if (text('screen') && !resolveScreenLabel(catalogue, text('screen'), [text('section')])) {
        refusals.add(`No screen is called "${text('screen')}" in ${text('section')}.`)
      }
    }
  }
  return [...refusals]
}

/** A source file the vault knows, for the tests and callers that need one. */
export async function sourceFileOf(id: number): Promise<SourceFile | undefined> {
  return (await sourceFilesTable.get(id))?.data as SourceFile | undefined
}
