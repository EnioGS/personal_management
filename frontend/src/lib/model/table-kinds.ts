import type { TableSchema } from '@/lib/table-schema'
import type { TableKind } from './types'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR')
// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — format in UTC to match.
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

/** Money in vs. out on a bank statement. A closed set, unlike the category vocabulary. */
export const DIRECTIONS = ['in', 'out'] as const
export type Direction = (typeof DIRECTIONS)[number]

const DIRECTION_LABEL: Record<string, string> = { in: 'Entrada', out: 'Saída' }

/** Buy vs. sell on an investment ledger. Also a closed set. */
export const TRANSACTION_TYPES = ['buy', 'sell'] as const
const TRANSACTION_TYPE_LABEL: Record<string, string> = { buy: 'Compra', sell: 'Venda' }

const dateColumn = { key: 'date', labelKey: 'common:columns.date', type: 'date' as const, format: (v: unknown) => date.format(v as number) }
const amountColumn = { key: 'amount', labelKey: 'common:columns.amount', type: 'number' as const, format: (v: unknown) => currency.format(v as number) }
const categoryColumn = { key: 'category', labelKey: 'common:columns.category', type: 'combobox' as const }
const descriptionColumn = { key: 'description', labelKey: 'common:columns.description', type: 'text' as const }
const noteColumn = { key: 'note', labelKey: 'common:columns.note', type: 'text' as const }

/**
 * The columns each kind of table has. Instances of a kind are unlimited — one
 * bankLedger per account, one cardLedger per card — but the column sets are fixed, so
 * everything downstream (CSV import/export, charts, the assistant's tools) stays
 * schema-driven rather than having to cope with arbitrary user-defined columns.
 *
 * Typed loosely (`TableSchema<any>`) because a schema here describes a row shape that
 * is only known at runtime, from the table's kind — see entries-store.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLE_KIND_SCHEMAS: Record<TableKind, TableSchema<any>> = {
  bankLedger: [
    dateColumn,
    {
      key: 'direction',
      labelKey: 'common:columns.direction',
      type: 'select',
      options: DIRECTIONS,
      format: (v: unknown) => DIRECTION_LABEL[v as string] ?? String(v),
    },
    categoryColumn,
    descriptionColumn,
    amountColumn,
  ],
  cardLedger: [dateColumn, categoryColumn, descriptionColumn, amountColumn],
  investmentLedger: [
    dateColumn,
    { key: 'asset', labelKey: 'common:columns.asset', type: 'text', required: true },
    {
      key: 'type',
      labelKey: 'common:columns.transactionType',
      type: 'select',
      options: TRANSACTION_TYPES,
      format: (v: unknown) => TRANSACTION_TYPE_LABEL[v as string] ?? String(v),
    },
    { key: 'quantity', labelKey: 'common:columns.quantity', type: 'number', format: (v: unknown) => number.format(v as number) },
    { key: 'price', labelKey: 'common:columns.price', type: 'number', format: (v: unknown) => currency.format(v as number) },
    noteColumn,
  ],
  contributions: [
    dateColumn,
    { key: 'destination', labelKey: 'common:columns.destination', type: 'combobox' },
    amountColumn,
  ],
  generic: [dateColumn, categoryColumn, amountColumn, noteColumn],
}

export const TABLE_KINDS = Object.keys(TABLE_KIND_SCHEMAS) as TableKind[]

/** Which kinds are bound to an account / a card — drives the "add table" dialog. */
export const KIND_REQUIRES_ACCOUNT: TableKind[] = ['bankLedger']
export const KIND_REQUIRES_CARD: TableKind[] = ['cardLedger']

/** The column holding this kind's open category vocabulary, if it has one. */
export function categoryColumnFor(kind: TableKind): string | null {
  const col = TABLE_KIND_SCHEMAS[kind].find((c) => c.type === 'combobox')
  return col ? String(col.key) : null
}
