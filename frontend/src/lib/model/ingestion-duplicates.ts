/**
 * Duplicate detection across everything the ingestion centre knows about.
 *
 * It cannot be an exact key. A statement exported twice, or the same transaction
 * arriving in a card file and a bank file, will not agree on every column — and a
 * CSV that simply lacks a column must not become "not a duplicate" for that reason.
 * So each pair is compared only on the fields *both* sides actually have, a field
 * present on both and disagreeing rules the pair out, and the confidence reported is
 * how much evidence there was. Two comparable fields is enough to raise it for a
 * human (or the assistant) to judge; one is not.
 */

import { parseDateValue } from '@/lib/parse-date'

export type DuplicateConfidence = 'identical' | 'high' | 'medium'

export interface ComparableRow {
  /** Whatever the caller uses to identify this row afterwards. */
  key: string
  date: string | null
  amount: number | null
  description: string
  /** Source-row fingerprint or import key: equality here is proof on its own. */
  fingerprint?: string
  /** Free-form context returned with a match, e.g. the row's status. */
  context?: Record<string, unknown>
}

export interface DuplicateMatch {
  candidateKey: string
  matchKey: string
  confidence: DuplicateConfidence
  comparedOn: string[]
  context?: Record<string, unknown>
}

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Sign lives in the flow-role label, not in the number, so magnitude is what compares. */
export function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(Math.abs(value) * 100) / 100 : null
  const text = String(value ?? '')
  // Text with no digit at all is not a number: stripping the letters would leave an
  // empty string, which Number() reads as 0 — and a description would then satisfy
  // "amount below 10".
  if (!/\d/.test(text)) return null
  const amount = Number(text.replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) / 100 : null
}

/** Day precision: the same transaction can carry different timestamps in two files. */
export function normalizeDate(value: unknown): string | null {
  const ms = parseDateValue(value)
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10)
}

/**
 * Descriptions rarely survive a round trip unchanged: one file truncates, another
 * keeps the bank's full narration. Equality, containment, or a strong shared-word
 * ratio all count as the same text; anything weaker counts as a disagreement.
 */
function describesTheSameThing(left: string, right: string): boolean {
  if (left === right) return true
  if (left.length >= 8 && right.length >= 8 && (left.includes(right) || right.includes(left))) return true
  const leftWords = new Set(left.split(' ').filter((word) => word.length > 2))
  const rightWords = new Set(right.split(' ').filter((word) => word.length > 2))
  if (leftWords.size === 0 || rightWords.size === 0) return false
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length
  return shared / Math.min(leftWords.size, rightWords.size) >= 0.6
}

function compare(candidate: ComparableRow, other: ComparableRow): DuplicateMatch | null {
  if (candidate.fingerprint && candidate.fingerprint === other.fingerprint) {
    return { candidateKey: candidate.key, matchKey: other.key, confidence: 'identical', comparedOn: ['fingerprint'], context: other.context }
  }

  const comparedOn: string[] = []
  if (candidate.date && other.date) {
    if (candidate.date !== other.date) return null
    comparedOn.push('date')
  }
  if (candidate.amount !== null && other.amount !== null) {
    if (candidate.amount !== other.amount) return null
    comparedOn.push('amount')
  }
  if (candidate.description && other.description) {
    if (!describesTheSameThing(candidate.description, other.description)) return null
    comparedOn.push('description')
  }

  // One shared field is a coincidence — two people can spend 19.90 on the same day.
  if (comparedOn.length < 2) return null
  return { candidateKey: candidate.key, matchKey: other.key, confidence: comparedOn.length >= 3 ? 'high' : 'medium', comparedOn, context: other.context }
}

/**
 * Matches candidates against a corpus. Bucketed by amount so a large worklist does
 * not become a full cross product: an amount present on both sides must be equal, so
 * rows in another bucket can never match. Rows with no amount fall back to their date.
 */
export function findDuplicateMatches(
  candidates: ComparableRow[],
  corpus: ComparableRow[],
  maxMatchesPerCandidate = 5,
): DuplicateMatch[] {
  const buckets = new Map<string, ComparableRow[]>()
  const bucketKeys = (row: ComparableRow) => (row.amount !== null ? [`amount:${row.amount}`] : row.date ? [`date:${row.date}`] : [])
  for (const row of corpus) {
    for (const key of bucketKeys(row)) buckets.set(key, [...(buckets.get(key) ?? []), row])
    // A row without an amount still has to be findable by amount-carrying candidates.
    if (row.amount === null && row.date) buckets.set(`date:${row.date}`, buckets.get(`date:${row.date}`) ?? [])
  }

  const matches: DuplicateMatch[] = []
  for (const candidate of candidates) {
    const pool = [
      ...(candidate.amount !== null ? (buckets.get(`amount:${candidate.amount}`) ?? []) : []),
      ...(candidate.date ? (buckets.get(`date:${candidate.date}`) ?? []) : []),
    ]
    const seen = new Set<string>()
    const found: DuplicateMatch[] = []
    for (const other of pool) {
      if (other.key === candidate.key || seen.has(other.key)) continue
      seen.add(other.key)
      const match = compare(candidate, other)
      if (match) found.push(match)
      if (found.length >= maxMatchesPerCandidate) break
    }
    matches.push(...found)
  }
  return matches
}

/**
 * The same file can repeat a row inside itself — an export run twice into one CSV, or
 * a statement that lists a charge and its instalment line. Comparing a batch against
 * what is already stored never sees that, so the batch is also compared against
 * itself, each pair reported once.
 *
 * A genuine repeat is indistinguishable from a duplicate here (two 9.90 charges on one
 * day are a real thing), so these are reported separately and judged, not assumed.
 */
export function findDuplicateMatchesWithin(rows: ComparableRow[], maxMatchesPerCandidate = 5): DuplicateMatch[] {
  const seenPairs = new Set<string>()
  return findDuplicateMatches(rows, rows, maxMatchesPerCandidate).filter((match) => {
    const pair = [match.candidateKey, match.matchKey].sort().join('|')
    if (seenPairs.has(pair)) return false
    seenPairs.add(pair)
    return true
  })
}
