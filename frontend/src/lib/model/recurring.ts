import { monthKey } from '@/lib/aggregations'

/**
 * Words that say a charge repeats, in either language.
 *
 * Recurrence stopped being a label anyone applies, so it is read from the meaning labels
 * instead: a row called "assinatura" is a subscription whether or not three months of it
 * have been imported yet. Everything else has to earn the description by repeating.
 */
export const RECURRING_WORDS = ['assinatura', 'assinaturas', 'membership', 'mensalidade', 'parcelado', 'parcela', 'subscription', 'recorrente']

export function declaresRecurrence(...text: (string | undefined)[]): boolean {
  const haystack = text.filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return RECURRING_WORDS.some((word) => haystack.includes(word))
}

export interface RecurringCandidate {
  category: string
  /** Average of the matched amounts — individual charges vary slightly (fees, rounding). */
  averageAmount: number
  /** Distinct months this category+amount combination appeared in, most recent last. */
  months: string[]
  lastDate: number
}

/**
 * Groups entries by category and a rounded amount, then keeps only groups that
 * recurred in at least `minMonths` distinct months — Recorrentes' whole detection
 * logic. Rounding to the nearest whole currency unit absorbs small month-to-month
 * variance (a subscription at R$29,90 one month and R$29,91 the next is still one
 * subscription) without needing a configurable tolerance.
 *
 * Deliberately simple pattern matching, not a forecast: it surfaces what *already*
 * repeated, so the user can label/act on it, rather than predicting anything.
 */
export function detectRecurringEntries(
  entries: { date: number; amount: number; category: string }[],
  minMonths = 3,
): RecurringCandidate[] {
  // category -> rounded amount -> the months/dates seen for that pair.
  const groups = new Map<string, Map<number, { months: Set<string>; amounts: number[]; dates: number[] }>>()

  for (const entry of entries) {
    const bucket = Math.round(entry.amount)
    if (!groups.has(entry.category)) groups.set(entry.category, new Map())
    const byAmount = groups.get(entry.category)!
    if (!byAmount.has(bucket)) byAmount.set(bucket, { months: new Set(), amounts: [], dates: [] })
    const group = byAmount.get(bucket)!
    group.months.add(monthKey(entry.date))
    group.amounts.push(entry.amount)
    group.dates.push(entry.date)
  }

  const candidates: RecurringCandidate[] = []
  for (const [category, byAmount] of groups) {
    for (const group of byAmount.values()) {
      if (group.months.size < minMonths) continue
      candidates.push({
        category,
        averageAmount: group.amounts.reduce((sum, a) => sum + a, 0) / group.amounts.length,
        months: [...group.months].sort(),
        lastDate: Math.max(...group.dates),
      })
    }
  }

  return candidates.sort((a, b) => b.months.length - a.months.length || b.averageAmount - a.averageAmount)
}
