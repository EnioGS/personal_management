import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import type { Transaction } from '@/lib/current-value'
import { fixedIncomeTable } from './fixed-income-db'

export const useFixedIncomeStore = createEncryptedListStore<Transaction>(fixedIncomeTable)
