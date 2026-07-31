import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import type { TableSchema } from '@/lib/table-schema'
import { contributionsTable } from './contributions-db'

export type Contribution = {
  date: number
  amount: number
  destination: string
}

export const CONTRIBUTION_DESTINATIONS = ['Renda Variável', 'Renda Fixa', 'Outros'] as const

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — format in UTC to match.
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

export const contributionsSchema: TableSchema<Contribution> = [
  { key: 'date', labelKey: 'investments:columns.date', type: 'date', format: (v) => date.format(v as number) },
  {
    key: 'destination',
    labelKey: 'investments:columns.destination',
    type: 'select',
    options: CONTRIBUTION_DESTINATIONS,
  },
  { key: 'amount', labelKey: 'investments:columns.amount', type: 'number', format: (v) => currency.format(v as number) },
]

export const useContributionsStore = createEncryptedListStore<Contribution>(contributionsTable)
