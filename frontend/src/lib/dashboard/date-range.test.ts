import { describe, expect, it } from 'vitest'
import { isWithinRange, previousEquivalentRange, resolvePreset } from './date-range'

// A fixed "now" so presets are deterministic — 2026-03-15 UTC, well into the year.
const NOW = new Date('2026-03-15T12:34:56Z')

describe('resolvePreset', () => {
  it('last12Months starts at the first day of the twelfth calendar month in the window', () => {
    const range = resolvePreset('last12Months', NOW)
    expect(new Date(range.to).toISOString()).toBe('2026-03-15T23:59:59.999Z')
    expect(new Date(range.from).toISOString()).toBe('2025-04-01T00:00:00.000Z')
  })

  it('last24Months starts at the first day of the twenty-fourth calendar month in the window', () => {
    const range = resolvePreset('last24Months', NOW)
    expect(new Date(range.from).toISOString()).toBe('2024-04-01T00:00:00.000Z')
  })

  it('thisYear starts on January 1st of the current year', () => {
    const range = resolvePreset('thisYear', NOW)
    expect(new Date(range.from).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('is stable regardless of the time of day "now" falls on', () => {
    const morning = resolvePreset('last12Months', new Date('2026-03-15T00:00:01Z'))
    const night = resolvePreset('last12Months', new Date('2026-03-15T23:59:59Z'))
    expect(morning).toEqual(night)
  })
})

describe('isWithinRange', () => {
  const range = resolvePreset('last12Months', NOW)

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
    const range = resolvePreset('last12Months', NOW)
    const previous = previousEquivalentRange(range)
    expect(previous.to).toBe(range.from - 1)
    expect(previous.to - previous.from).toBe(range.to - range.from)
  })
})
