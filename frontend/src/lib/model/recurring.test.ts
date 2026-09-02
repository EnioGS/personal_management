import { describe, expect, it } from 'vitest'
import { detectRecurringEntries } from './recurring'

function entry(month: string, category: string, amount: number) {
  return { date: Date.parse(`${month}-05`), category, amount }
}

describe('detectRecurringEntries', () => {
  it('flags a category+amount seen in at least minMonths distinct months', () => {
    const entries = [
      entry('2026-01', 'Streaming', 29.9),
      entry('2026-02', 'Streaming', 29.9),
      entry('2026-03', 'Streaming', 29.9),
    ]

    const result = detectRecurringEntries(entries, 3)

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Streaming')
    expect(result[0].averageAmount).toBeCloseTo(29.9)
    expect(result[0].months).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('does not flag a one-off, or something seen in too few months', () => {
    const entries = [entry('2026-01', 'Streaming', 29.9), entry('2026-02', 'Streaming', 29.9)]

    expect(detectRecurringEntries(entries, 3)).toEqual([])
  })

  it('tolerates small amount variance by rounding to the nearest whole unit', () => {
    const entries = [entry('2026-01', 'Streaming', 29.9), entry('2026-02', 'Streaming', 29.91), entry('2026-03', 'Streaming', 29.85)]

    expect(detectRecurringEntries(entries, 3)).toHaveLength(1)
  })

  it('does not merge genuinely different amounts in the same category', () => {
    const entries = [
      entry('2026-01', 'Mercado', 50),
      entry('2026-02', 'Mercado', 50),
      entry('2026-03', 'Mercado', 50),
      entry('2026-01', 'Mercado', 400),
      entry('2026-02', 'Mercado', 400),
      entry('2026-03', 'Mercado', 400),
    ]

    const result = detectRecurringEntries(entries, 3)
    expect(result).toHaveLength(2)
  })

  it('does not merge the same amount across different categories', () => {
    const entries = [
      entry('2026-01', 'Streaming', 30),
      entry('2026-02', 'Streaming', 30),
      entry('2026-03', 'Streaming', 30),
      entry('2026-01', 'Academia', 30),
      entry('2026-02', 'Academia', 30),
    ]

    const result = detectRecurringEntries(entries, 3)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Streaming')
  })

  it('counts distinct months, not occurrences — two charges in one month is not "two months"', () => {
    const entries = [
      entry('2026-01', 'Streaming', 30),
      { date: Date.parse('2026-01-20'), category: 'Streaming', amount: 30 },
      entry('2026-02', 'Streaming', 30),
    ]

    expect(detectRecurringEntries(entries, 3)).toEqual([])
  })

  it('sorts by month count, then average amount, descending', () => {
    const entries = [
      ...['2026-01', '2026-02', '2026-03'].map((m) => entry(m, 'Aluguel', 1500)),
      ...['2026-01', '2026-02', '2026-03', '2026-04'].map((m) => entry(m, 'Internet', 100)),
    ]

    const result = detectRecurringEntries(entries, 3)
    expect(result.map((r) => r.category)).toEqual(['Internet', 'Aluguel'])
  })

  it('reports the most recent occurrence as lastDate', () => {
    const entries = [entry('2026-01', 'Streaming', 30), entry('2026-02', 'Streaming', 30), entry('2026-03', 'Streaming', 30)]

    const result = detectRecurringEntries(entries, 3)
    expect(result[0].lastDate).toBe(Date.parse('2026-03-05'))
  })
})
