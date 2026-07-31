import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import type { Transaction } from '@/lib/current-value'
import { variableIncomeTable } from './variable-income-db'

export const useVariableIncomeStore = createEncryptedListStore<Transaction>(variableIncomeTable)
