import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'

/**
 * One database for the whole configurable model: the config entities plus every
 * table's rows.
 *
 * `entries` deliberately holds the rows of *all* user tables, tagged with `tableId`,
 * rather than a Dexie table per user table — Dexie schemas are declared statically at
 * version time, so a table created at runtime could not get its own store without a
 * version bump and a reload.
 */
const db = new Dexie('app-model-db') as Dexie & {
  accounts: EntityTable<LocalRow, 'id'>
  cards: EntityTable<LocalRow, 'id'>
  budgets: EntityTable<LocalRow, 'id'>
  allocationTargets: EntityTable<LocalRow, 'id'>
  ingestionAuditEvents: EntityTable<LocalRow, 'id'>
  labelRules: EntityTable<LocalRow, 'id'>
  sourceFiles: EntityTable<LocalRow, 'id'>
  sourceRows: EntityTable<LocalRow, 'id'>
  confirmedRows: EntityTable<LocalRow, 'id'>
  classificationNotes: EntityTable<LocalRow, 'id'>
}

db.version(1).stores({
  accounts: '++id, createdAt',
  cards: '++id, createdAt',
  tableDefs: '++id, createdAt',
  categories: '++id, createdAt',
  categoryRules: '++id, createdAt',
  entries: '++id, createdAt',
})

// Additive — Dexie carries every unmentioned table over from version 1 unchanged, so
// this only needs to declare the two new ones (Orçamento's per-category targets and
// Alocação's per-asset targets).
db.version(2).stores({
  budgets: '++id, createdAt',
  allocationTargets: '++id, createdAt',
})

// `investmentClass` is table metadata, not an indexed field, but existing model
// tables need one stored value so Variable Income and Fixed Income can be separate
// workspaces. The old built-in "Renda Fixa" table is inferred reliably by name;
// custom legacy investment tables retain their previous Variable Income placement.
db.version(3).stores({
  accounts: '++id, createdAt',
  cards: '++id, createdAt',
  tableDefs: '++id, createdAt',
  categories: '++id, createdAt',
  categoryRules: '++id, createdAt',
  entries: '++id, createdAt',
  budgets: '++id, createdAt',
  allocationTargets: '++id, createdAt',
})

// Before `income` existed, separately paid investment interest had to be entered
// as a sell. Convert the unambiguous historical spelling so it no longer reduces
// an investment position or the Capital evolution line. A user-entered note that
// merely mentions juros remains untouched; this is deliberately exact.
db.version(4).stores({
  accounts: '++id, createdAt',
  cards: '++id, createdAt',
  tableDefs: '++id, createdAt',
  categories: '++id, createdAt',
  categoryRules: '++id, createdAt',
  entries: '++id, createdAt',
  budgets: '++id, createdAt',
  allocationTargets: '++id, createdAt',
})

// The ingestion centre keeps source provenance and classifications beside the
// configurable model. Entries remain schema-specific; their cross-table labels are
// stored as sidecars so a bank/card/investment table never needs artificial columns.
db.version(5).stores({
  accounts: '++id, createdAt',
  cards: '++id, createdAt',
  tableDefs: '++id, createdAt',
  categories: '++id, createdAt',
  categoryRules: '++id, createdAt',
  entries: '++id, createdAt',
  budgets: '++id, createdAt',
  allocationTargets: '++id, createdAt',
  ingestionSources: '++id, createdAt',
  ingestionColumnMappings: '++id, createdAt',
  ingestionRows: '++id, createdAt',
  entryLabels: '++id, createdAt',
  ingestionAuditEvents: '++id, createdAt',
})

// Category rules are gone: a row's semantic category is now a label the user (or the
// assistant) sets in the ingestion centre, never a substring rule applied at read
// time. Categories themselves remain as the vocabulary those labels name.
db.version(6).stores({ categoryRules: null })

// `unknown` was a poor name for the recurrence parking value: it read as a fact
// about the row rather than as "nobody decided yet". Rename it in place, in both
// the confirmed label sidecars and the rows still waiting in the worklist.
db.version(7).stores({})

// Standing labelling rules: what was worked out for one import applies to the next.
db.version(8).stores({ labelRules: '++id, createdAt' })

/**
 * The one-phase model: a file and its rows are worked on in place, and confirming copies
 * a row into a table per (section, screen) pair it names. The stores it replaces —
 * staged ingestion rows, column mappings, entries, their label sidecars, the table
 * definitions and the category vocabulary — are dropped: everything they held is either
 * in a source row, in a confirmed row, or was a restatement of one of them.
 */
db.version(9).stores({
  sourceFiles: '++id, createdAt',
  sourceRows: '++id, createdAt',
  confirmedRows: '++id, createdAt',
  ingestionSources: null,
  ingestionColumnMappings: null,
  ingestionRows: null,
  entryLabels: null,
  entries: null,
  tableDefs: null,
  categories: null,
})

/**
 * Notes on how to classify, which are not rules.
 *
 * A rule matches text and fills labels; a note says something a rule cannot — "Charme is
 * a market, so it is food", "anything from the broker file in March was a rebalance" —
 * and is read by the assistant as context before it labels anything. Neither replaces
 * the other: the rule acts, the note explains.
 */
db.version(10).stores({ classificationNotes: '++id, createdAt' })

/**
 * The Movements screen was stored under the id `overview`, which is the word it had
 * before it was renamed on screen — so a row could only be explained by translating
 * between the two. Renaming the id renames the table those rows live in, so the rows,
 * the labels still waiting on them and any rule that names the screen are carried over
 * with it. See adr/0032: a screen renamed with its content intact takes its table along.
 */
db.version(11).stores({}).upgrade(async (tx) => {
  const rename = (screen: unknown) => (screen === 'overview' ? 'movements' : screen)

  await tx.table('confirmedRows').toCollection().modify((row: { data?: { screen?: string } }) => {
    if (row.data?.screen === 'overview') row.data.screen = 'movements'
  })

  const relabel = (row: { data?: { labels?: { screens?: string[] } } }) => {
    const screens = row.data?.labels?.screens
    if (screens) row.data!.labels!.screens = screens.map(rename) as string[]
  }
  await tx.table('sourceRows').toCollection().modify(relabel)
  await tx.table('labelRules').toCollection().modify(relabel)
})

/**
 * `amount` meant two different things, and the collision was costing real data.
 *
 * On a money row it was what moved; on an investment row the money was `quantity` ×
 * `price` while `amount` meant nothing at all — so a file's amount column could be
 * assigned in either sense and only one of them was read. Money is `value` now and
 * `amount` is units of a thing, which is what the word means when someone says "the
 * amount I bought". Existing rows are carried across rather than reinterpreted: what was
 * money stays money, what was a quantity keeps being a quantity.
 */
db.version(12).stores({}).upgrade(async (tx) => {
  await tx.table('confirmedRows').toCollection().modify((row: { data?: Record<string, unknown> }) => {
    const data = row.data
    if (!data) return
    if ('amount' in data) { data.value = data.amount; delete data.amount }
    if ('quantity' in data) { data.amount = data.quantity; delete data.quantity }
  })

  await tx.table('sourceFiles').toCollection().modify((row: { data?: { assignments?: Record<string, string> } }) => {
    const assignments = row.data?.assignments
    if (!assignments) return
    for (const [column, field] of Object.entries(assignments)) {
      if (field === 'amount') assignments[column] = 'value'
      else if (field === 'quantity') assignments[column] = 'amount'
    }
  })

  await tx.table('sourceRows').toCollection().modify((row: { data?: Record<string, unknown> }) => {
    const data = row.data
    if (data && 'importedAmount' in data) { data.importedValue = data.importedAmount; delete data.importedAmount }
  })
})

/**
 * Drops the uploaded text from files that still carry it.
 *
 * It was stored beside the rows parsed out of it and never read again — so every reload
 * of the file list decoded every byte of every file imported, which is what made a vault
 * with a few dozen files feel slow at rest.
 */
db.version(13).stores({}).upgrade(async (tx) => {
  await tx.table('sourceFiles').toCollection().modify((row: { data?: { rawCsv?: string } }) => {
    if (row.data) delete row.data.rawCsv
  })
})

/**
 * Clears the `outros` that used to be a category's starting value.
 *
 * It was the app's word, not the user's: every imported row arrived saying it was "other"
 * before anyone had looked, which reads on every screen as a decision somebody made. An
 * empty category says the true thing — nobody has said yet — and a rule can fill it
 * without arguing with a label. A row where somebody typed `outros` deliberately is
 * indistinguishable from one where nothing happened, so both are cleared: what was never
 * a judgement is not lost by being read as none.
 */
db.version(14).stores({}).upgrade(async (tx) => {
  const clear = (value: unknown) => (value === 'outros' ? '' : value)

  await tx.table('confirmedRows').toCollection().modify((row: { data?: Record<string, unknown> }) => {
    if (!row.data) return
    row.data.category = clear(row.data.category)
    row.data.subcategory = clear(row.data.subcategory)
  })

  await tx.table('sourceRows').toCollection().modify((row: { data?: { labels?: Record<string, unknown> } }) => {
    const labels = row.data?.labels
    if (!labels) return
    if (labels.category === 'outros') delete labels.category
    if (labels.subcategory === 'outros') delete labels.subcategory
  })
})

/**
 * The investment-only columns give way to one label every table has.
 *
 * `asset`, `investmentType` and `investmentClass` were columns only investment rows ever
 * filled, and only investment screens ever read — so a row could not be moved between
 * tables without leaving part of its meaning behind, and the words on it could not be
 * queried the way every other label can. `class` replaces all three: what kind of thing
 * the row is, on every row, beside category and subcategory.
 *
 * The old class is carried over rather than discarded, since it was the one of the three
 * that said what a row is; an asset name lives on in the subcategory, which is where the
 * files had been putting it anyway. Assignments pointing at a target that no longer exists
 * are dropped, or the file would keep offering a column nothing can receive.
 */
db.version(15).stores({}).upgrade(async (tx) => {
  const retired = ['asset', 'investmentType', 'investmentClass']

  await tx.table('confirmedRows').toCollection().modify((row: { data?: Record<string, unknown> }) => {
    const data = row.data
    if (!data) return
    const carried = [data.investmentClass, data.investmentType].find((value) => typeof value === 'string' && value.trim())
    if (carried && !data.class) data.class = carried
    if (!data.subcategory && typeof data.asset === 'string' && data.asset.trim()) data.subcategory = data.asset
    for (const field of retired) delete data[field]
  })

  await tx.table('sourceFiles').toCollection().modify((row: { data?: { assignments?: Record<string, unknown> } }) => {
    const assignments = row.data?.assignments
    if (!assignments) return
    for (const [column, target] of Object.entries(assignments)) {
      if (typeof target === 'string' && retired.includes(target)) delete assignments[column]
    }
  })
})

export const accountsTable = db.accounts
export const cardsTable = db.cards
export const budgetsTable = db.budgets
export const allocationTargetsTable = db.allocationTargets
export const ingestionAuditEventsTable = db.ingestionAuditEvents
export const labelRulesTable = db.labelRules
export const classificationNotesTable = db.classificationNotes
export const sourceFilesTable = db.sourceFiles
export const sourceRowsTable = db.sourceRows
export const confirmedRowsTable = db.confirmedRows
