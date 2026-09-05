import { useMemo } from 'react'
import type { Transaction } from '@/lib/current-value'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { useConfirmedRowsStore } from './model-stores'
import type { ConfirmedRow } from './types'

/** The screen every investment row is confirmed onto; holdings are read from there and nowhere else. */
export const INVESTMENTS_SCREEN = 'investments'

/**
 * Reads a confirmed row as a portfolio transaction.
 *
 * Three things are recovered rather than demanded. The kind comes from whatever the
 * file called it, since "compra"/"buy"/"aporte" all mean the same purchase; anything
 * that mentions a payout is income, anything that mentions a sale is a sell, and the
 * rest is a purchase, which is what an investment row usually is. The unit price is
 * derived from the amount when the file gave a total instead of a price. And the
 * amount's sign, which is how direction is expressed everywhere else in the app, is
 * dropped here — a position is a size, not a direction.
 */
export function asTransaction(row: ConfirmedRow): Transaction {
  // `amount` is units and `value` is money — the two an investment row is made of.
  const units = typeof row.amount === 'number' ? Math.abs(row.amount) : 0
  const money = typeof row.value === 'number' ? Math.abs(row.value) : 0
  const price = typeof row.price === 'number' ? Math.abs(row.price) : units > 0 ? money / units : money
  return {
    date: Number.isFinite(row.date) ? (row.date as number) : 0,
    // What the position is in: the row's own name for the thing, which is its subcategory
    // ("tesouro - IPCA+") before it is the broad label above it.
    asset: row.subcategory.trim() || row.class?.trim() || row.category,
    type: investmentKind(row),
    quantity: units > 0 ? units : money > 0 && price > 0 ? money / price : 0,
    price,
    category: row.category,
    note: row.observations,
  }
}

const INCOME_WORDS = ['income', 'dividend', 'dividendo', 'rendimento', 'provento', 'juros', 'yield']
const SELL_WORDS = ['sell', 'sale', 'venda', 'resgate', 'saque', 'withdraw']
/**
 * The class names, removed before the kind is read.
 *
 * "Fixed income" says what a holding is, not what happened to it, and it contains the
 * word this test looks for — so a row labelled with its class would otherwise be read as
 * a payout, every purchase of a Tesouro paper counted as a dividend.
 */
const CLASS_PHRASES = /fixed income|variable income|renda fixa|renda vari[áa]vel/g

function investmentKind(row: ConfirmedRow): Transaction['type'] {
  const text = `${row.subcategory} ${row.category}`.toLowerCase().replace(CLASS_PHRASES, ' ')
  if (INCOME_WORDS.some((word) => text.includes(word))) return 'income'
  if (SELL_WORDS.some((word) => text.includes(word))) return 'sell'
  return 'buy'
}

/** What the class tests need, which a confirmed row and a dashboard entry both carry. */
interface ClassifiableRow {
  class?: string
  category: string
}

/**
 * Where a row says what kind of thing it is.
 *
 * The class label answers exactly this, and the category is read with it because a row
 * labelled before there was a class label put the answer there. The subcategory is not
 * read: it names the particular thing, and a paper called "tesouro - reserva" would
 * otherwise be counted as the cash reserve.
 */
function classText(row: ClassifiableRow): string {
  return `${row.class ?? ''} ${row.category}`.toLowerCase()
}

/** True when the row's class text names fixed income, whatever language it was written in. */
export function isFixedIncome(row: ClassifiableRow): boolean {
  const text = classText(row)
  return text.includes('fixed') || text.includes('fixa')
}

export function isVariableIncome(row: ClassifiableRow): boolean {
  const text = classText(row)
  return text.includes('variable') || text.includes('variável') || text.includes('variavel')
}

/**
 * True when the row names money held as money: the reserve, kept liquid on purpose.
 *
 * It is a holding like any other and says so on its own row — not whatever is left in the
 * accounts after the investments are counted, which is a different quantity entirely.
 */
export function isCashReserve(row: ClassifiableRow): boolean {
  const text = classText(row)
  return text.includes('cash') || text.includes('caixa') || text.includes('reserva') || text.includes('liquidez')
}

export function investmentRowsOf(rows: StoredRow<ConfirmedRow>[]): StoredRow<ConfirmedRow>[] {
  return rows.filter((row) => row.screen === INVESTMENTS_SCREEN && !row.markedForElimination)
}

/** Every confirmed investment row, marked ones excluded like everywhere else. */
export function useInvestmentRows(): StoredRow<ConfirmedRow>[] {
  const rows = useConfirmedRowsStore((store) => store.items)
  return useMemo(() => investmentRowsOf(rows), [rows])
}

export function useInvestmentTransactions(): Transaction[] {
  const rows = useInvestmentRows()
  return useMemo(() => rows.map(asTransaction), [rows])
}
