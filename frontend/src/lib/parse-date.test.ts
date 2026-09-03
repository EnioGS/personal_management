import { describe, expect, it } from 'vitest'
import { parseDateValue } from './parse-date'

describe('parseDateValue', () => {
  it('reads the day-first dates Brazilian statements write', () => {
    expect(parseDateValue('15/08/2025')).toBe(Date.UTC(2025, 7, 15))
    expect(parseDateValue('01.09.2026')).toBe(Date.UTC(2026, 8, 1))
    expect(parseDateValue('7-3-2026')).toBe(Date.UTC(2026, 2, 7))
  })

  it('swaps when the first number cannot be a day but the second can', () => {
    expect(parseDateValue('08/15/2025')).toBe(Date.UTC(2025, 7, 15))
  })

  it('still reads ISO dates and stored epochs', () => {
    expect(parseDateValue('2026-01-02')).toBe(Date.UTC(2026, 0, 2))
    expect(parseDateValue(Date.UTC(2026, 0, 2))).toBe(Date.UTC(2026, 0, 2))
    expect(parseDateValue('1755216000000')).toBe(1755216000000)
  })

  it('refuses what is not a date, including a day that month does not have', () => {
    expect(parseDateValue('31/02/2026')).toBeNull()
    expect(parseDateValue('40/13/2026')).toBeNull()
    expect(parseDateValue('Pagamento de fatura')).toBeNull()
    expect(parseDateValue('')).toBeNull()
  })
})
