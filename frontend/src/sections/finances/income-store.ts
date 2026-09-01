import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { TableSchema } from '@/lib/table-schema'
import { incomeTable } from './income-db'

export type IncomeRow = {
  date: number
  source: string
  amount: number
  note?: string
  /** Soft-delete flag — not a visible column (no ColumnDef), set only via the assistant's tools or the app UI. */
  deleted?: boolean
}

export const INCOME_SOURCES = ['Salário', 'Freelance', 'Investimentos', 'Outros'] as const

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — format in UTC to match.
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

export const incomeSchema: TableSchema<IncomeRow> = [
  { key: 'date', labelKey: 'finances:columns.date', type: 'date', format: (v) => date.format(v as number) },
  { key: 'source', labelKey: 'finances:columns.source', type: 'select', options: INCOME_SOURCES },
  { key: 'amount', labelKey: 'finances:columns.amount', type: 'number', format: (v) => currency.format(v as number) },
  { key: 'note', labelKey: 'finances:columns.note', type: 'text' },
]

export const useIncomeStore = createLocalListStore<IncomeRow>(incomeTable)
