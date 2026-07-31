import type { TableSchema } from '@/lib/table-schema'
import type { Transaction } from '@/lib/current-value'

export const TRANSACTION_TYPES = ['buy', 'sell'] as const

const TYPE_LABEL: Record<string, string> = { buy: 'Compra', sell: 'Venda' }
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR')
// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — format in UTC to match.
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

/** Shared by Variable Income and Fixed Income — identical transaction-ledger shape (see plan). */
export const transactionSchema: TableSchema<Transaction> = [
  { key: 'date', labelKey: 'investments:columns.date', type: 'date', format: (v) => date.format(v as number) },
  { key: 'asset', labelKey: 'investments:columns.asset', type: 'text', required: true },
  {
    key: 'type',
    labelKey: 'investments:columns.type',
    type: 'select',
    options: TRANSACTION_TYPES,
    format: (v) => TYPE_LABEL[v as string] ?? String(v),
  },
  { key: 'quantity', labelKey: 'investments:columns.quantity', type: 'number', format: (v) => number.format(v as number) },
  { key: 'price', labelKey: 'investments:columns.price', type: 'number', format: (v) => currency.format(v as number) },
  { key: 'note', labelKey: 'investments:columns.note', type: 'text' },
]
