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
  tableDefs: EntityTable<LocalRow, 'id'>
  categories: EntityTable<LocalRow, 'id'>
  categoryRules: EntityTable<LocalRow, 'id'>
  entries: EntityTable<LocalRow, 'id'>
  budgets: EntityTable<LocalRow, 'id'>
  allocationTargets: EntityTable<LocalRow, 'id'>
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

export const accountsTable = db.accounts
export const cardsTable = db.cards
export const tableDefsTable = db.tableDefs
export const categoriesTable = db.categories
export const categoryRulesTable = db.categoryRules
export const entriesTable = db.entries
export const budgetsTable = db.budgets
export const allocationTargetsTable = db.allocationTargets
