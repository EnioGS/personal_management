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

export const accountsTable = db.accounts
export const cardsTable = db.cards
export const budgetsTable = db.budgets
export const allocationTargetsTable = db.allocationTargets
export const ingestionAuditEventsTable = db.ingestionAuditEvents
export const labelRulesTable = db.labelRules
export const sourceFilesTable = db.sourceFiles
export const sourceRowsTable = db.sourceRows
export const confirmedRowsTable = db.confirmedRows
