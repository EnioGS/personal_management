import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { TableSchema } from '@/lib/table-schema'
import { spendingTable } from './spending-db'

// A type alias, not an interface — interfaces don't structurally satisfy the
// Record<string, unknown> generic constraint used by EditableDataTable/chart components.
export type SpendingRow = {
  date: number
  category: string
  amount: number
  note?: string
  /** Soft-delete flag — not a visible column (no ColumnDef), set only via the assistant's tools or the app UI. */
  deleted?: boolean
}

export const SPENDING_CATEGORIES = ['Alimentação', 'Contas', 'Transporte', 'Lazer', 'Saúde', 'Outros'] as const

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — format in UTC to match.
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

export const spendingSchema: TableSchema<SpendingRow> = [
  { key: 'date', labelKey: 'finances:columns.date', type: 'date', format: (v) => date.format(v as number) },
  { key: 'category', labelKey: 'finances:columns.category', type: 'select', options: SPENDING_CATEGORIES },
  { key: 'amount', labelKey: 'finances:columns.amount', type: 'number', format: (v) => currency.format(v as number) },
  { key: 'note', labelKey: 'finances:columns.note', type: 'text' },
]

export const useSpendingStore = createLocalListStore<SpendingRow>(spendingTable)
