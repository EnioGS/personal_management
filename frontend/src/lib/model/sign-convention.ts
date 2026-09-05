import { parseNumberValue } from '@/lib/parse-number'
import type { SignConvention } from './types'

/**
 * Making a file's signs mean what ours mean.
 *
 * Negative leaves, positive arrives — that is the whole of this app's convention, and a
 * file that disagrees has to be brought into line rather than annotated. Two kinds of
 * disagreement occur in practice: a file that inverts everything (a card export listing
 * purchases as positive), and a file whose amounts are all one sign because direction
 * lives in another column (buy/sell, received/sent).
 *
 * The transformed value is what the row carries; the value the file wrote is kept in the
 * row's observations, so the two can always be compared and nothing is lost.
 */
export function applySignConvention(amount: number | null, convention: SignConvention, row: Record<string, string>): number | null {
  if (amount === null) return null
  if (convention.kind === 'invertAll') return -amount
  if (convention.kind === 'invertWhen') {
    const value = String(row[convention.column] ?? '').trim().toLowerCase()
    const outflow = convention.values.some((candidate) => candidate.trim().toLowerCase() === value)
    // The file states direction elsewhere, so the sign it wrote carries no information:
    // magnitude is what it means, and the other column decides the rest.
    return outflow ? -Math.abs(amount) : Math.abs(amount)
  }
  return amount
}

/** What a column looks like, for deciding a convention from evidence rather than a guess. */
export interface AmountShape {
  count: number
  negatives: number
  positives: number
  min: number | null
  max: number | null
}

export function shapeOfAmounts(values: unknown[]): AmountShape {
  const numbers = values.map(parseNumberValue).filter((value): value is number => value !== null)
  return {
    count: numbers.length,
    negatives: numbers.filter((value) => value < 0).length,
    positives: numbers.filter((value) => value > 0).length,
    min: numbers.length ? Math.min(...numbers) : null,
    max: numbers.length ? Math.max(...numbers) : null,
  }
}
