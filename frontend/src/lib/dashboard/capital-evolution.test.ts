import { describe, expect, it } from 'vitest'
import { capitalEvolution, type CapitalEntry } from './capital-evolution'

const range = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 31) }
const on = (month: number, day: number, value: number): CapitalEntry => ({ date: Date.UTC(2026, month, day), value })

describe('capitalEvolution', () => {
  it('carries the running total across months, and reports each month on its own', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 100), on(0, 8, -30), on(2, 2, -20)],
      investments: [],
    }, range)

    expect(points).toEqual([
      { month: '2026-01', capital: 70, investments: 0, income: 70, spending: 30 },
      { month: '2026-02', capital: 70, investments: 0, income: 0, spending: 0 },
      { month: '2026-03', capital: 50, investments: 0, income: -20, spending: 20 },
    ])
  })

  it('reads spending off the movements, so a bill already paid is not spent twice', () => {
    // The rows on the spending screen itemise this same bill; they are not passed in.
    const points = capitalEvolution({ movements: [on(0, 5, -284.9), on(0, 6, 1000)], investments: [] }, range)

    expect(points[0]).toMatchObject({ capital: 715.1, income: 715.1, spending: 284.9 })
  })

  it('counts what went into holdings as capital, and as investments', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 1000), on(1, 1, -500)],
      investments: [on(1, 1, 500)],
    }, range)

    // Buying an investment moves money rather than losing it: capital is unchanged. The
    // walk runs to the last month with anything in it, which is February here.
    expect(points.map((point) => [point.capital, point.investments])).toEqual([[1000, 0], [1000, 500]])
  })

  it('uses history before the window to open at the right number', () => {
    const points = capitalEvolution({
      movements: [{ date: Date.UTC(2025, 11, 1), value: 100 }, on(0, 1, -20)],
      investments: [],
    }, { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31) })

    expect(points).toEqual([{ month: '2026-01', capital: 80, investments: 0, income: -20, spending: 20 }])
  })

  it('says nothing when there is nothing, rather than a row of zeroes', () => {
    expect(capitalEvolution({ movements: [], investments: [] }, range)).toEqual([])
  })

  it('leaves out a date nothing could read, which would otherwise never be walked to', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 100), { date: Number.NaN, value: -50 }],
      investments: [],
    }, range)

    expect(points).toEqual([{ month: '2026-01', capital: 100, investments: 0, income: 100, spending: 0 }])
  })
})
