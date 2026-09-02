import { describe, expect, it } from 'vitest'
import { isWithinRange, previousEquivalentRange, resolvePreset } from './date-range'

// A fixed "now" so presets are deterministic — 2026-03-15 UTC, well into the year.
const NOW = new Date('2026-03-15T12:34:56Z')

describe('resolvePreset', () => {
  it('last30 spans the 30 days up to and including today', () => {
    const range = resolvePreset('last30', NOW)
    expect(new Date(range.to).toISOString()).toBe('2026-03-15T23:59:59.999Z')
    // Exactly 30*DAY_MS before `to`, so it lands on the same end-of-day offset 30
    // calendar days earlier, not midnight.
    expect(new Date(range.from).toISOString()).toBe('2026-02-13T23:59:59.999Z')
  })

  it('last90 spans exactly 90 days', () => {
    const range = resolvePreset('last90', NOW)
    expect(range.to - range.from).toBe(90 * 86_400_000)
  })

  it('thisYear starts on January 1st of the current year', () => {
    const range = resolvePreset('thisYear', NOW)
    expect(new Date(range.from).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('is stable regardless of the time of day "now" falls on', () => {
    const morning = resolvePreset('last30', new Date('2026-03-15T00:00:01Z'))
    const night = resolvePreset('last30', new Date('2026-03-15T23:59:59Z'))
    expect(morning).toEqual(night)
  })
})

describe('isWithinRange', () => {
  const range = resolvePreset('last30', NOW)

  it('includes both endpoints', () => {
    expect(isWithinRange(range.from, range)).toBe(true)
    expect(isWithinRange(range.to, range)).toBe(true)
  })

  it('excludes dates just outside either endpoint', () => {
    expect(isWithinRange(range.from - 1, range)).toBe(false)
    expect(isWithinRange(range.to + 1, range)).toBe(false)
  })
})

describe('previousEquivalentRange', () => {
  it('is adjacent to and the same length as the original range', () => {
    const range = resolvePreset('last30', NOW)
    const previous = previousEquivalentRange(range)
    expect(previous.to).toBe(range.from - 1)
    expect(previous.to - previous.from).toBe(range.to - range.from)
  })
})
