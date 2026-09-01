import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { Transaction } from '@/lib/current-value'
import { fixedIncomeTable } from './fixed-income-db'

export const useFixedIncomeStore = createLocalListStore<Transaction>(fixedIncomeTable)
