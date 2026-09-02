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

/** Stored on investment table definitions so the two investment workspaces stay separate. */
export type InvestmentClass = 'variableIncome' | 'fixedIncome'

export interface TableDef {
  name: string
  kind: TableKind
  /** Set for bankLedger — which account this table records. */
  accountId?: number
  /** Set for cardLedger — which card this table records. */
  cardId?: number
  /** Set for investmentLedger; intentionally metadata, not a visible row column. */
  investmentClass?: InvestmentClass
}

/**
 * A canonical category. It is pure vocabulary: the semantic-category label on an
 * ingestion row names one of these, and typing a name that does not exist yet
 * creates it. There is no rule engine that derives a category from row text.
 */
export interface Category {
  name: string
  /** Restricts where the category is offered; undefined means every table. */
  scope?: TableKind
  archived?: boolean
}

/** One row of user data. Every table's rows live in a single store, split by `tableId`. */
export interface Entry {
  /** Row id of the TableDef this entry belongs to. */
  tableId: number
  /** Soft-delete flag — see adr/0018. */
  deleted?: boolean
  /** Stable source-row fingerprint used by imports to make re-importing a statement idempotent. */
  importKey?: string
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

/**
 * The one Finance surface a labelled row belongs to. It is single-valued: a
 * spending row is still money that moved, so Movements reads it too, rather than
 * the row having to claim both. Recurrence is its own dimension, so there is no
 * `recurring` destination competing with `spending`.
 */
export type FinanceDestination = 'movements' | 'spending' | 'investments'

/**
 * Economic direction, independent from the sign convention used by a source file.
 * `cancelled` marks a voided or reversed record that must not reach any total.
 */
export type FlowRole = 'inflow' | 'outflow' | 'transfer' | 'adjustment' | 'cancelled'

/** Where the event is settled; used to keep card, cash and investment effects distinct. */
export type SettlementChannel = 'checkingAccount' | 'creditCard' | 'cash' | 'investment' | 'other'

/** A spending record either adds to spend, offsets it, or is unrelated to spending. */
export type SpendingTreatment = 'expense' | 'rebate' | 'notApplicable'

export type RecurrenceLabel = 'oneOff' | 'recurring' | 'unknown'

export type IngestionSourceStatus = 'draftSource' | 'mapped' | 'staged' | 'archived'
export type IngestionRowStatus =
  | 'unlabelled'
  | 'ready'
  | 'promoted'
  | 'reconciledExisting'
  | 'invalid'
  | 'promotionError'

/** Canonical values available above a raw source file's original column headers. */
export type IngestionTargetField =
  | 'date'
  | 'amount'
  | 'description'
  | 'rawCategory'
  | 'direction'
  | 'accountReference'
  | 'cardReference'
  | 'asset'
  | 'quantity'
  | 'price'
  | 'investmentType'
  | 'note'
  | 'destination'
  | 'financeDestination'
  | 'flowRole'
  | 'settlementChannel'
  | 'spendingTreatment'
  | 'categoryId'
  | 'recurrence'
  | 'destinationTableId'

/** An uploaded CSV retained locally and identified by its unmodified-byte fingerprint. */
export interface IngestionSource {
  originalFilename: string
  sourceFingerprint: string
  importedAt: number
  /** Original CSV text. It is source provenance and is never rewritten by mappings. */
  rawCsv: string
  originalColumns: string[]
  /** Virtual empty columns supplement sparse source files without changing rawCsv. */
  supplementalColumns: string[]
  rowCount: number
  status: IngestionSourceStatus
  /** True only for the synthetic source that links pre-existing app entries. */
  legacy?: boolean
  /**
   * Marks which one-off repair of the legacy queue has already run for this
   * source, so a repair corrects historical data exactly once instead of
   * discarding labels the user has assigned since.
   */
  repairVersion?: number
}

/** Maps one original or supplemental source column onto exactly one canonical field. */
export interface IngestionColumnMapping {
  sourceId: number
  sourceColumn: string
  targetField: IngestionTargetField
  /** Reserved for a future parsing UI; mappings are lossless until then. */
  parser?: string
  isSupplemental?: boolean
}

/** Labels are sidecar data so all table schemas can share the same classification model. */
export interface EntryLabels {
  entryId: number
  financeDestination: FinanceDestination
  flowRole: FlowRole
  settlementChannel: SettlementChannel
  spendingTreatment: SpendingTreatment
  categoryId?: number
  recurrence: RecurrenceLabel
  sourceIngestionRowId?: number
}

export interface IngestionRowLabels {
  financeDestination?: FinanceDestination
  flowRole?: FlowRole
  settlementChannel?: SettlementChannel
  spendingTreatment?: SpendingTreatment
  categoryId?: number
  recurrence?: RecurrenceLabel
}

/**
 * The literal values last typed in the ingestion worklist.  Labels retain only
 * valid canonical values, while these drafts let the UI keep and flag an
 * invalid value instead of silently discarding what the user entered.
 */
export interface IngestionRowLabelValues {
  financeDestination?: string
  flowRole?: string
  settlementChannel?: string
  spendingTreatment?: string
  category?: string
  recurrence?: string
  destinationTable?: string
}

/** A lossless raw row plus its mapped values, labels and promotion lineage. */
export interface IngestionRow {
  sourceId: number
  sourceRowIndex: number
  sourceRowFingerprint: string
  rawValues: Record<string, string>
  mappedValues: Partial<Record<IngestionTargetField, unknown>>
  labels: IngestionRowLabels
  labelValues?: IngestionRowLabelValues
  status: IngestionRowStatus
  validationErrors: string[]
  destinationTableId?: number
  /** Present for a migration row linked to an already stored entry. */
  existingEntryId?: number
  /** Present after a newly staged row is promoted to an app entry. */
  promotedEntryId?: number
}

/** Append-only trace of user/assistant classification actions. */
export interface IngestionAuditEvent {
  event: 'sourceUploaded' | 'mappingChanged' | 'rowsStaged' | 'labelsChanged' | 'rowsPromoted' | 'rowsReconciled' | 'promotionFailed'
  actor: 'user' | 'assistant' | 'migration'
  sourceId?: number
  ingestionRowIds?: number[]
  entryIds?: number[]
  details?: Record<string, unknown>
}
