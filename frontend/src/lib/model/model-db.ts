import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { inferInvestmentClass } from './investment-class'
import type { Entry, TableDef } from './types'

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
  tableDefs: EntityTable<LocalRow, 'id'>
  categories: EntityTable<LocalRow, 'id'>
  entries: EntityTable<LocalRow, 'id'>
  budgets: EntityTable<LocalRow, 'id'>
  allocationTargets: EntityTable<LocalRow, 'id'>
  ingestionSources: EntityTable<LocalRow, 'id'>
  ingestionColumnMappings: EntityTable<LocalRow, 'id'>
  ingestionRows: EntityTable<LocalRow, 'id'>
  entryLabels: EntityTable<LocalRow, 'id'>
  ingestionAuditEvents: EntityTable<LocalRow, 'id'>
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
}).upgrade(async (tx) => {
  await tx.table('tableDefs').toCollection().modify((row: LocalRow) => {
    const table = row.data as Partial<TableDef> | undefined
    if (!table || table.kind !== 'investmentLedger' || table.investmentClass) return
    row.data = { ...table, investmentClass: inferInvestmentClass(table.name) }
  })
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
}).upgrade(async (tx) => {
  await tx.table('entries').toCollection().modify((row: LocalRow) => {
    const entry = row.data as Partial<Entry> | undefined
    const note = typeof entry?.note === 'string' ? entry.note : ''
    if (entry?.type !== 'sell' || note.trim().toLocaleLowerCase('pt-BR') !== 'juros') return
    row.data = { ...entry, type: 'income' }
  })
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

export const accountsTable = db.accounts
export const cardsTable = db.cards
export const tableDefsTable = db.tableDefs
export const categoriesTable = db.categories
export const entriesTable = db.entries
export const budgetsTable = db.budgets
export const allocationTargetsTable = db.allocationTargets
export const ingestionSourcesTable = db.ingestionSources
export const ingestionColumnMappingsTable = db.ingestionColumnMappings
export const ingestionRowsTable = db.ingestionRows
export const entryLabelsTable = db.entryLabels
export const ingestionAuditEventsTable = db.ingestionAuditEvents
