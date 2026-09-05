import { monthKey } from '@/lib/aggregations'
import { UNLABELLED_LABEL, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import type { NestedBarGroup } from '@/components/dashboard/nested-bar-list'

/** A month of money in and money out, both as the quantities they are, and their net. */
export interface MonthlyFlow {
  month: string
  incoming: number
  outgoing: number
  /** Signed: what the month added to the accounts, or took from them. */
  net: number
  [key: string]: string | number
}

export interface RankedItem {
  key: string
  label: string
  value: number
}

const named = (value: string | undefined) => value?.trim() || UNLABELLED_LABEL

/**
 * What arrived, what left, and what the difference came to, month by month.
 *
 * The two halves are kept apart rather than only netted: two months can net the same
 * while one earned twice as much and spent twice as much, and that is the more
 * interesting fact about them. The net rides alongside so the answer is there too.
 */
export function monthlyFlow(rows: FilteredEntry[]): MonthlyFlow[] {
  const months = new Map<string, MonthlyFlow>()
  for (const row of rows) {
    const month = monthKey(row.date)
    const flow = months.get(month) ?? { month, incoming: 0, outgoing: 0, net: 0 }
    if (row.value >= 0) flow.incoming += row.value
    else flow.outgoing += -row.value
    flow.net += row.value
    months.set(month, flow)
  }
  return [...months.values()].sort((left, right) => left.month.localeCompare(right.month))
}

/**
 * The share of what arrived that was not spent again, over the whole period.
 *
 * Null rather than zero when nothing arrived: a rate of nothing is not a rate of 0%, and
 * a screen that says 0% invites a conclusion nobody can draw.
 */
export function savingsRate(rows: FilteredEntry[]): number | null {
  const incoming = rows.filter((row) => row.value > 0).reduce((sum, row) => sum + row.value, 0)
  if (incoming === 0) return null
  const outgoing = rows.filter((row) => row.value < 0).reduce((sum, row) => sum - row.value, 0)
  return (incoming - outgoing) / incoming
}

/** What money came in for, by category — the other half of the spending breakdown. */
export function incomeByCategory(rows: FilteredEntry[]): RankedItem[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.value <= 0) continue
    totals.set(named(row.category), (totals.get(named(row.category)) ?? 0) + row.value)
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((left, right) => right.value - left.value)
}

/**
 * Every account with the cards billed to it underneath.
 *
 * The two questions are one question — an account's balance and what its cards took out
 * of it belong side by side — so they are answered from the two ledgers at once: the
 * balance from the movements, the card totals from the itemised spending rows, which are
 * the only place a card is named. An account nobody has spent on still appears, with
 * nothing under it, because a balance is an answer on its own.
 */
export function accountsWithCards(movements: FilteredEntry[], spending: FilteredEntry[]): NestedBarGroup[] {
  const balances = new Map<string, number>()
  for (const row of movements) balances.set(named(row.account), (balances.get(named(row.account)) ?? 0) + row.value)

  const cards = new Map<string, Map<string, number>>()
  for (const row of spending) {
    if (row.value >= 0 || !row.card?.trim()) continue
    const account = named(row.account)
    if (!balances.has(account)) balances.set(account, 0)
    const byCard = cards.get(account) ?? new Map<string, number>()
    byCard.set(row.card.trim(), (byCard.get(row.card.trim()) ?? 0) - row.value)
    cards.set(account, byCard)
  }

  return [...balances.entries()]
    .map(([label, value]) => ({
      key: label,
      label,
      value,
      children: [...(cards.get(label) ?? new Map()).entries()]
        .map(([card, spent]) => ({ key: card, label: card, value: spent as number }))
        .sort((left, right) => right.value - left.value),
    }))
    .sort((left, right) => right.value - left.value)
}

/** The rows worth looking at first: the largest movements either way, most of them. */
export function largestMovements(rows: FilteredEntry[], limit = 40): FilteredEntry[] {
  return [...rows].sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, limit)
}

/**
 * How long what is held would cover what is spent, at the rate of the period shown.
 *
 * Null when nothing was spent — dividing by no spending says "forever", which is true and
 * useless — and negative capital answers zero rather than a negative number of months.
 */
export function monthsOfRunway(capital: number, spendingByMonth: number[]): number | null {
  const months = spendingByMonth.filter((month) => month > 0)
  if (months.length === 0) return null
  const average = months.reduce((sum, month) => sum + month, 0) / months.length
  return Math.max(0, capital) / average
}

/** The average of what a month brought in and what it took out, over the period shown. */
export function monthlyAverages(flow: MonthlyFlow[]): { incoming: number; outgoing: number; net: number } {
  if (flow.length === 0) return { incoming: 0, outgoing: 0, net: 0 }
  const incoming = flow.reduce((sum, month) => sum + month.incoming, 0) / flow.length
  const outgoing = flow.reduce((sum, month) => sum + month.outgoing, 0) / flow.length
  return { incoming, outgoing, net: incoming - outgoing }
}
