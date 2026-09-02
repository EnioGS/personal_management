import { monthKey } from '@/lib/aggregations'
import type { InvestmentClass } from '@/lib/model/types'
import type { DateRange } from './date-range'

const DAY_MS = 86_400_000

export interface CapitalEntry {
  date: number
  amount: number
  direction: 'in' | 'out'
  cardId?: number
  financeDestination?: string
  spendingTreatment?: 'expense' | 'rebate' | 'notApplicable'
}

export interface CapitalEvolutionPoint {
  month: string
  /** Cash movement accumulated from the earliest matching money entry. */
  cashCapital: number
  /** Cumulative Variable Income applications less redemptions. */
  variableIncome: number
  /** Cumulative Fixed Income applications less redemptions. */
  fixedIncome: number
  /** Cash capital plus both investment classes — the user's total capital. */
  capital: number
  cardSpend: number
  [key: string]: string | number
}

export interface InvestmentValueEntry {
  date: number
  asset: string
  type: 'buy' | 'sell' | 'income'
  quantity: number
  price: number
  investmentClass: InvestmentClass
  /** Kept here as a second guard for callers that pass model rows directly. */
  deleted?: boolean
}

function monthStart(month: string): number {
  return Date.parse(`${month}-01`)
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return monthKey(date.getTime())
}

/**
 * Monthly closing capital from the complete matching history. Outgoing amounts are
 * subtracted explicitly because the stored ledgers use positive spend magnitudes;
 * negative refunds therefore correctly increase capital. Credit-card spend is a
 * second, positive-only monthly measure drawn on the same chart scale.
 */
export function capitalEvolution(
  entries: CapitalEntry[],
  range: DateRange,
  investments: InvestmentValueEntry[] = [],
): CapitalEvolutionPoint[] {
  if (entries.length === 0 && investments.length === 0) return []

  const byMonth = new Map<string, { capitalDelta: number; cardSpend: number }>()
  for (const entry of entries) {
    const month = monthKey(entry.date)
    const bucket = byMonth.get(month) ?? { capitalDelta: 0, cardSpend: 0 }
    // Card purchases are obligations, not cash movements. Their eventual payment
    // is already represented in the linked bank ledger, so including both would
    // double-count card spend. Keep card rows only for the red monthly bars.
    // Spending is money that moved, so it counts towards cash capital exactly like
    // a plain movement; only the card rows are held back, because a card purchase is
    // an obligation whose payment already appears in the linked bank ledger.
    if (!entry.cardId && entry.financeDestination !== 'investments') bucket.capitalDelta += entry.direction === 'in' ? entry.amount : -entry.amount
    if (entry.cardId && entry.financeDestination === 'spending') {
      if (entry.spendingTreatment === 'rebate') bucket.cardSpend -= entry.amount
      else if (entry.spendingTreatment === 'expense') bucket.cardSpend += entry.amount
    }
    byMonth.set(month, bucket)
  }

  const investmentsByClass = new Map<InvestmentClass, Map<string, InvestmentValueEntry[]>>([
    ['variableIncome', new Map()],
    ['fixedIncome', new Map()],
  ])
  for (const investment of investments) {
    if (investment.deleted) continue
    const month = monthKey(investment.date)
    const byInvestmentMonth = investmentsByClass.get(investment.investmentClass)!
    byInvestmentMonth.set(month, [...(byInvestmentMonth.get(month) ?? []), investment])
  }

  const months = [...new Set([
    ...byMonth.keys(),
    ...investmentsByClass.get('variableIncome')!.keys(),
    ...investmentsByClass.get('fixedIncome')!.keys(),
  ])].sort()
  const first = months[0]
  const last = months.at(-1)!
  const points: CapitalEvolutionPoint[] = []
  let month = first
  let cashCapital = 0
  const investedCapital = new Map<InvestmentClass, number>([
    ['variableIncome', 0],
    ['fixedIncome', 0],
  ])

  while (month <= last) {
    const bucket = byMonth.get(month) ?? { capitalDelta: 0, cardSpend: 0 }
    cashCapital += bucket.capitalDelta
    for (const investmentClass of ['variableIncome', 'fixedIncome'] as const) {
      for (const transaction of investmentsByClass.get(investmentClass)!.get(month) ?? []) {
        // Capital evolution is a cash-flow view, not a live-price portfolio valuation:
        // applications add their recorded value and redemptions remove it. This keeps
        // a fully redeemed portfolio at zero even when historic bond unit quantities
        // are unavailable or were entered as a simple "1" per operation.
        const valueDelta = transaction.quantity * transaction.price
        const signedValue = transaction.type === 'buy' ? valueDelta : transaction.type === 'sell' ? -valueDelta : 0
        investedCapital.set(
          investmentClass,
          roundCurrency((investedCapital.get(investmentClass) ?? 0) + signedValue),
        )
      }
    }
    const variableIncome = investedCapital.get('variableIncome') ?? 0
    const fixedIncome = investedCapital.get('fixedIncome') ?? 0
    const capital = cashCapital + variableIncome + fixedIncome
    const start = monthStart(month)
    const end = Date.parse(`${nextMonth(month)}-01`) - DAY_MS
    if (end >= range.from && start <= range.to) {
      points.push({ month, cashCapital, variableIncome, fixedIncome, capital, cardSpend: bucket.cardSpend })
    }
    month = nextMonth(month)
  }

  return points
}

/** Investment transaction values are currency amounts; avoid carrying binary-float dust into later months. */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
