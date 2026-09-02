import type { Transaction } from './current-value'

// Dates are stored as UTC-midnight epoch ms (parsed from "YYYY-MM-DD" strings via Date.parse,
// which is always UTC per spec) — bucket/format in UTC too, or the day/month shifts for any
// reader west of UTC.
export function monthKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateLabelFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })

/** "2026-01" -> "jan. de 2026", for chart axis labels (Spending/Income/Contributions' monthly buckets). */
export function formatMonthLabel(key: string | number): string {
  return monthLabelFormatter.format(new Date(`${key}-01`))
}

/** Epoch ms -> "15 de jan.", for chart axis labels (Investments' per-transaction dates). */
export function formatDateLabel(value: string | number): string {
  return dateLabelFormatter.format(new Date(Number(value)))
}

export function bucketByMonth<T>(
  rows: T[],
  dateKey: keyof T,
  valueKey: keyof T,
): { month: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = monthKey(row[dateKey] as number)
    totals.set(key, (totals.get(key) ?? 0) + (row[valueKey] as number))
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }))
}

export function groupByKey<T>(
  rows: T[],
  key: keyof T,
  valueKey: keyof T,
): { label: string; value: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const label = String(row[key])
    totals.set(label, (totals.get(label) ?? 0) + (row[valueKey] as number))
  }
  return [...totals.entries()].map(([label, value]) => ({ label, value }))
}

/**
 * A pie/legend can carry as many *distinct* categories as the data has — a bank
 * statement's category vocabulary isn't capped at 8 — but the validated categorical
 * palette (see chart-colors.ts) only has 8 slots, and past ~7 a legend stops being
 * readable regardless of color (see the dataviz skill's series-count ladder). Rather
 * than mint more hues (an accessibility anti-pattern — see chart-colors.ts), the
 * smallest categories fold into one "other" bucket beyond `maxCategories`.
 */
export function foldTopCategories(
  data: { label: string; value: number }[],
  maxCategories: number,
  otherLabel: string,
): { label: string; value: number }[] {
  if (data.length <= maxCategories) return data
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, maxCategories)
  const otherTotal = sorted.slice(maxCategories).reduce((sum, d) => sum + d.value, 0)
  return [...top, { label: otherLabel, value: otherTotal }]
}

/** Step function: value only changes at transaction events, flat between them — intentional, not a bug (see current-value.ts). */
export function runningPositionOverTime(transactions: Transaction[]): { date: number; value: number }[] {
  const sorted = [...transactions].sort((a, b) => a.date - b.date)
  const quantities = new Map<string, number>()
  const lastPrices = new Map<string, number>()

  return sorted.map((t) => {
    const delta = t.type === 'buy' ? t.quantity : -t.quantity
    quantities.set(t.asset, (quantities.get(t.asset) ?? 0) + delta)
    lastPrices.set(t.asset, t.price)

    let value = 0
    for (const [asset, quantity] of quantities) value += quantity * (lastPrices.get(asset) ?? 0)
    return { date: t.date, value }
  })
}

export function runningBalance(
  income: { date: number; amount: number }[],
  spending: { date: number; amount: number }[],
): { date: number; balance: number }[] {
  const events = [
    ...income.map((r) => ({ date: r.date, delta: r.amount })),
    ...spending.map((r) => ({ date: r.date, delta: -r.amount })),
  ].sort((a, b) => a.date - b.date)

  let balance = 0
  return events.map((e) => {
    balance += e.delta
    return { date: e.date, balance }
  })
}
