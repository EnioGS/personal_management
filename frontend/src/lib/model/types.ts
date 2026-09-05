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

/** Which of the two lines an investment joins on the capital chart. */
export type InvestmentClass = 'variableIncome' | 'fixedIncome'

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
 * What one of a file's own columns can be said to mean.
 *
 * Deliberately short: these are the fields the app computes with. Everything else a
 * file carries stays verbatim and is condensed into the observations column when the
 * row is confirmed, so a narrow list costs nothing.
 */
export type IngestionTargetField =
  | 'date'
  /** Money that moved, signed. What Movements and Spending are made of. */
  | 'value'
  /** How much of a thing changed hands: units of an investment, not money. */
  | 'amount'
  | 'asset'
  /** What one unit was worth. `amount` x `price` is the money an investment row moved. */
  | 'price'
  | 'investmentType'
  | 'investmentClass'

export interface IngestionRowLabels {
  sections?: string[]
  screens?: string[]
  category?: string
  subcategory?: string
  /** Which of the user's accounts this row belongs to, by the name it was set up under. */
  account?: string
  /** Which of the user's credit cards it belongs to, likewise by name. */
  card?: string
}

/**
 * A standing decision: rows whose text matches get these labels the moment a file
 * arrives, so what was worked out once is not worked out again on the next import.
 *
 * A rule fills only labels a row does not already have — a judgement made by hand or
 * by the assistant always outranks a standing rule — and it records itself on the row,
 * which is what lets the rule report honestly on how it has done.
 */

/** Which stage a rule belongs to: files being worked on, or rows already confirmed. */
export type RuleContext = 'source' | 'confirmed'

/**
 * Something worth knowing when labelling, written by the user or the assistant.
 *
 * Not a rule: a rule matches text and fills labels, and everything it cannot express —
 * that a shop nobody recognises sells food, that one file's March rows were a
 * rebalance, that transfers to a particular name are rent — has nowhere to go. A note
 * is that place. The assistant is given the notes of a stage before it labels anything
 * in it, and treats them as the user talking about their own data.
 */
export interface ClassificationNote {
  context: RuleContext
  text: string
  createdBy: 'user' | 'assistant'
  createdAt: number
  /** Set when the note has been redrafted since. The note keeps its place in the list. */
  editedBy?: 'user' | 'assistant'
  editedAt?: number
}

export interface LabelRule {
  /** Where this rule runs. A rule never crosses from one stage to the other. */
  context: RuleContext
  /** Short name for the list; falls back to the matched text when absent. */
  name?: string
  /** Which field the text is looked for in — 'description' unless stated. */
  field: string
  contains: string
  /**
   * How the text is compared. Substring by default, which is what most rules want —
   * but a short merchant name is a substring of half the file ("of" is inside
   * Microsoft), so a rule about one needs to say it means the whole value or the
   * start of it.
   */
  match?: 'contains' | 'equals' | 'startsWith' | 'regex'
  caseSensitive?: boolean
  /**
   * Further conditions, all of which must hold. What a row means often depends on
   * where it came from as much as on what it says: "uber" on a card statement is a
   * card expense, the same word on a bank export is a Pix to a driver, and a rule that
   * can only look at one field cannot tell them apart.
   */
  where?: { field: string; contains: string; match?: 'contains' | 'equals' | 'startsWith' | 'regex'; caseSensitive?: boolean }[]
  labels: IngestionRowLabels
  /**
   * Why this label set is safe for everything matching this text. Written by whoever
   * created the rule, edited freely afterwards: a rule nobody can justify later is a
   * rule nobody can safely keep.
   */
  rationale?: string
  createdBy: 'user' | 'assistant'
  createdAt: number
  /** Set when the rule has been rewritten since. It keeps its place in the list. */
  editedBy?: 'user' | 'assistant'
  editedAt?: number
}

/** Append-only trace of user/assistant classification actions. */
export interface IngestionAuditEvent {
  event: 'sourceUploaded' | 'mappingChanged' | 'rowsStaged' | 'labelsChanged' | 'rowsPromoted' | 'rowsReconciled' | 'rowsReallocated' | 'rowsDiscarded' | 'rulesApplied' | 'promotionFailed'
  actor: 'user' | 'assistant' | 'migration'
  sourceId?: number
  ingestionRowIds?: number[]
  entryIds?: number[]
  details?: Record<string, unknown>
}

/** How a source file's amount column relates to ours, once someone has worked it out. */
export type SignConvention =
  | { kind: 'asImported' }
  /** Every amount means the opposite of what we mean by its sign. */
  | { kind: 'invertAll' }
  /**
   * The file states direction in another column instead of in the sign: values matching
   * `whenColumn` against `whenValues` are outflows, whatever sign they carry.
   */
  | { kind: 'invertWhen'; column: string; values: string[] }

/** An uploaded file, kept whole, with what has been worked out about it. */
export interface SourceFile {
  originalFilename: string
  importedAt: number
  /** The file as it arrived. Never rewritten. */
  /**
   * The file's text as uploaded. Only kept on files imported before it stopped being
   * stored: the parsed rows hold everything it said, and re-reading a megabyte of text
   * into memory on every refresh bought nothing.
   */
  rawCsv?: string
  originalColumns: string[]
  /** Original column -> canonical field. Only original columns may be assigned. */
  assignments: Record<string, IngestionTargetField>
  signConvention: SignConvention
  /** Which already-imported file this one looks like a repeat of, if any. */
  looksLikeSourceId?: number
}

/**
 * One row of a source file, as it is worked on.
 *
 * `values` holds the file's own columns verbatim, plus `source_filename`. Labels live
 * beside them rather than inside, so a label can never collide with a column name.
 */
export interface SourceRow {
  sourceId: number
  /** Fixed at import and never changed, however much of the row later changes. */
  rowId: string
  values: Record<string, string>
  labels: IngestionRowLabels
  markedForElimination?: boolean
  appliedRuleIds?: number[]
  /**
   * What the file wrote in the value column, kept when a sign convention rewrote it.
   * The rewrite happens in the data rather than beside it, so this is what makes it
   * reversible — and what reaches the observations of every confirmed row.
   */
  importedValue?: string
  /**
   * The `row_id` of a row from **another** file that this one looks like. Advisory and
   * nothing more: it removes nothing by itself. Two identical rows inside one file are
   * two real transactions — banks report them — so only a match across files is
   * evidence of anything.
   */
  duplicateOf?: string
}

/**
 * A confirmed row, in the table its labels chose.
 *
 * A row placed on several screens is copied once per (section, screen) pair, every copy
 * carrying the same `rowId`. Copies are independent afterwards; the id is what relates
 * them, and what a correction reuses.
 */
export interface ConfirmedRow {
  rowId: string
  section: string
  screen: string
  confirmedAt: number
  date?: number
  /** Money that moved, signed the way this app means it: negative leaves, positive arrives. */
  value?: number
  /** Everything the file said that no column was assigned to, including what it came from. */
  observations: string
  category: string
  subcategory: string
  asset?: string
  /** Units of the asset, for an investment row. */
  amount?: number
  price?: number
  investmentType?: string
  investmentClass?: string
  /** The account and card labels the row was confirmed with, by name. */
  account?: string
  card?: string
  markedForElimination?: boolean
}
