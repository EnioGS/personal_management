import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { Transaction } from '@/lib/current-value'
import { variableIncomeTable } from './variable-income-db'

export const useVariableIncomeStore = createLocalListStore<Transaction>(variableIncomeTable)
