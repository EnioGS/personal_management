import { describe, expect, it } from 'vitest'
import { findDuplicateMatches, findDuplicateMatchesWithin, normalizeAmount, normalizeDate, type ComparableRow } from './ingestion-duplicates'


function row(key: string, overrides: Partial<ComparableRow> = {}): ComparableRow {
  return { key, date: '2026-01-02', amount: 19.9, description: 'amazonprimebr assinatura', ...overrides }
}

describe('finding duplicates across partial data', () => {
  it('calls a row identical when its fingerprint is already known', () => {
    const matches = findDuplicateMatches([row('new', { fingerprint: 'abc' })], [row('old', { fingerprint: 'abc', description: '', date: null })])

    expect(matches[0]).toMatchObject({ matchKey: 'old', confidence: 'identical' })
  })

  it('still matches when the new file has no description column', () => {
    const matches = findDuplicateMatches([row('new', { description: '' })], [row('old')])

    expect(matches[0]).toMatchObject({ confidence: 'medium', comparedOn: ['date', 'amount'] })
  })

  it('matches a truncated description against the bank\'s full narration', () => {
    const matches = findDuplicateMatches(
      [row('new', { description: 'transferencia recebida pelo pix enio' })],
      [row('old', { description: 'transferencia recebida pelo pix enio g santana jr bco do brasil' })],
    )

    expect(matches[0]).toMatchObject({ confidence: 'high', comparedOn: ['date', 'amount', 'description'] })
  })

  it('rules out a pair as soon as a field they both have disagrees', () => {
    expect(findDuplicateMatches([row('new', { amount: 20.9 })], [row('old')])).toEqual([])
    expect(findDuplicateMatches([row('new', { date: '2026-02-02' })], [row('old')])).toEqual([])
    expect(findDuplicateMatches([row('new', { description: 'netflix mensal' })], [row('old')])).toEqual([])
  })

  it('refuses to call one shared field a duplicate', () => {
    const matches = findDuplicateMatches([row('new', { date: null, description: '' })], [row('old', { description: '' })])

    expect(matches).toEqual([])
  })

  it('reports what each match was judged on, and where it lives', () => {
    const matches = findDuplicateMatches([row('new')], [row('old', { context: { status: 'promoted', table: 'Fatura Nubank' } })])

    expect(matches[0].context).toEqual({ status: 'promoted', table: 'Fatura Nubank' })
  })

  it('finds a batch repeating itself, reporting each pair once and never a row against itself', () => {
    const matches = findDuplicateMatchesWithin([row('a'), row('b'), row('c', { amount: 5, description: 'padaria' })])

    expect(matches).toHaveLength(1)
    expect([matches[0].candidateKey, matches[0].matchKey].sort()).toEqual(['a', 'b'])
  })

  it('normalises the shapes the same value arrives in', () => {
    expect(normalizeAmount('-19,90')).toBe(19.9)
    expect(normalizeAmount(19.9)).toBe(19.9)
    expect(normalizeDate(Date.UTC(2026, 0, 2))).toBe('2026-01-02')
    expect(normalizeDate('1767312000000')).toBe(normalizeDate(1767312000000))
    expect(normalizeDate('not a date')).toBeNull()
  })
})

describe('dates as the bank actually writes them', () => {
  it('compares a day-first file date against a stored epoch, instead of skipping the field', () => {
    const fileRow: ComparableRow = { key: 'file:13', date: normalizeDate('15/08/2025'), amount: 2.69, description: 'transferencia enviada pelo pix paulo' }
    const legacyRow: ComparableRow = { key: 'row:173', date: normalizeDate('1755216000000'), amount: 2.69, description: 'transferencia enviada pelo pix paulo' }

    const matches = findDuplicateMatches([fileRow], [legacyRow])

    expect(matches[0]).toMatchObject({ confidence: 'high', comparedOn: ['date', 'amount', 'description'] })
  })

  it('rules out the pair whose dates only looked incomparable', () => {
    const fileRow: ComparableRow = { key: 'file:15', date: normalizeDate('20/08/2025'), amount: 260, description: 'transferencia recebida pelo pix enio' }
    const legacyRow: ComparableRow = { key: 'row:146', date: normalizeDate('1752537600000'), amount: 260, description: 'transferencia recebida pelo pix enio' }

    expect(findDuplicateMatches([fileRow], [legacyRow])).toEqual([])
  })
})
