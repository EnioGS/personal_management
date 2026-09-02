/**
 * The user-configurable domain: accounts, cards, tables and the category vocabulary.
 *
 * These are *data*, not compile-time constants — that is the whole point of this
 * model. The app ships zero accounts and zero tables; everything below is created by
 * the user (or by the legacy migration) and travels in the export file, so importing
 * into a blank browser restores the whole setup, not just the rows.
 *
 * Entities reference each other by their row id (`StoredRow.id`, a Dexie
 * auto-increment number). That is safe here specifically because import *replaces*
 * rather than merges — `importData` wipes every table and `bulkPut`s the file's rows
 * with their original ids, so an id means the same thing before and after a
 * round-trip. Merging two exports would break that assumption and is not supported.
 */

export type AccountKind = 'checking' | 'savings' | 'cash' | 'broker'

export interface Account {
  name: string
  kind: AccountKind
  institution?: string
  archived?: boolean
}

export interface Card {
  name: string
  /** Row id of the Account this card settles against — required (a card always has a parent). */
  accountId: number
  limit?: number
  /** Day of month the invoice closes / falls due, 1-31. */
  closingDay?: number
  dueDay?: number
  archived?: boolean
}

/**
 * What a table *is*, which fixes its columns. Instances are unlimited (one cardLedger
 * per credit card, say); the column sets are not, so CSV, charts and the assistant's
 * tools stay schema-driven. See table-kinds.ts.
 */
export type TableKind = 'bankLedger' | 'cardLedger' | 'investmentLedger' | 'contributions' | 'dividends' | 'generic'

export interface TableDef {
  name: string
  kind: TableKind
  /** Set for bankLedger — which account this table records. */
  accountId?: number
  /** Set for cardLedger — which card this table records. */
  cardId?: number
}

/** A canonical category. Raw values in the data resolve to one of these via CategoryRule. */
export interface Category {
  name: string
  /** Restricts where the category is offered; undefined means every table. */
  scope?: TableKind
  archived?: boolean
}

export type CategoryMatch = 'equals' | 'contains' | 'startsWith' | 'regex'

/**
 * Maps raw values onto a Category at *read* time — the stored row keeps whatever the
 * import or the user actually wrote. That is what lets a rule added months later
 * reclassify all existing history at once, and be edited or removed without data loss.
 * Rules are evaluated in `priority` order and the first match wins.
 */
export interface CategoryRule {
  /** Row id of the Category this rule resolves to. */
  categoryId: number
  match: CategoryMatch
  pattern: string
  caseSensitive?: boolean
  priority: number
  /** Restricts the rule to one kind of table; undefined applies it everywhere. */
  scope?: TableKind
}

/** One row of user data. Every table's rows live in a single store, split by `tableId`. */
export interface Entry {
  /** Row id of the TableDef this entry belongs to. */
  tableId: number
  /** Soft-delete flag — see adr/0018. */
  deleted?: boolean
  /** Column values, keyed by the schema of the table's kind. */
  [field: string]: unknown
}

/** A monthly spending target for one category — Orçamento compares this to actual spend. */
export interface Budget {
  categoryId: number
  monthlyAmount: number
}

/** A target portfolio share for one asset — Alocação compares this to the actual current split. */
export interface AllocationTarget {
  asset: string
  targetPercent: number
}
