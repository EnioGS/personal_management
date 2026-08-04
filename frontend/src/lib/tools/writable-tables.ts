import type { DecryptedRow } from '@/lib/secure-store/create-encrypted-table'
import type { TableSchema } from '@/lib/table-schema'
import { contributionsSchema, useContributionsStore } from '@/sections/investments/contributions-store'
import { transactionSchema } from '@/sections/investments/transaction-schema'
import { useFixedIncomeStore } from '@/sections/investments/fixed-income-store'
import { useVariableIncomeStore } from '@/sections/investments/variable-income-store'
import { incomeSchema, useIncomeStore } from '@/sections/finances/income-store'
import { spendingSchema, useSpendingStore } from '@/sections/finances/spending-store'

interface ListStoreLike<T> {
  getState: () => {
    items: DecryptedRow<T>[]
    addItem: (value: T) => Promise<number>
    addItems: (values: T[]) => Promise<void>
    updateItem: (id: number, value: T) => Promise<void>
  }
}

export interface WritableTable<T = any> {
  key: string
  /** Human-readable name for the generated tool description — not i18n, see adr/0016. */
  label: string
  schema: TableSchema<T>
  useStore: ListStoreLike<T>
}

/**
 * Single source of truth for which tables write_to_table may append rows to. Deliberately
 * separate from vault-file.ts's TABLES map (raw encrypted export/import of ALL tables incl.
 * notes/assistant config) — this one is schema-driven, plaintext-row shaped, and scoped to
 * the Finances/Investments tables the assistant is allowed to write to. A future table just
 * needs an entry here to be picked up by the tool automatically.
 */
export const writableTables: WritableTable[] = [
  { key: 'spending', label: 'Spending', schema: spendingSchema, useStore: useSpendingStore },
  { key: 'income', label: 'Income', schema: incomeSchema, useStore: useIncomeStore },
  {
    key: 'variableIncome',
    label: 'Variable Income transactions',
    schema: transactionSchema,
    useStore: useVariableIncomeStore,
  },
  {
    key: 'fixedIncome',
    label: 'Fixed Income transactions',
    schema: transactionSchema,
    useStore: useFixedIncomeStore,
  },
  { key: 'contributions', label: 'Contributions', schema: contributionsSchema, useStore: useContributionsStore },
]

export function findWritableTable(key: string): WritableTable | undefined {
  return writableTables.find((t) => t.key === key)
}
