import { describe, expect, it } from 'vitest'
import { capitalEvolution, type CapitalEntry } from './capital-evolution'

const range = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 31) }
const on = (month: number, day: number, value: number): CapitalEntry => ({ date: Date.UTC(2026, month, day), value })

describe('capitalEvolution', () => {
  it('carries the running total across months, and reports each month on its own', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 100), on(0, 8, -30), on(2, 2, -20)],
      investments: [],
      spending: [on(2, 2, -20)],
    }, range)

    expect(points).toEqual([
      { month: '2026-01', capital: 70, investments: 0, income: 70, spending: 0 },
      { month: '2026-02', capital: 70, investments: 0, income: 0, spending: 0 },
      { month: '2026-03', capital: 50, investments: 0, income: -20, spending: 20 },
    ])
  })

  it('leaves capital alone for a spending row, which is a copy of the movement that paid it', () => {
    const purchase = on(0, 5, -284.9)
    const points = capitalEvolution({ movements: [purchase], investments: [], spending: [purchase] }, range)

    expect(points[0]).toMatchObject({ capital: -284.9, spending: 284.9 })
  })

  it('counts what went into holdings as capital, and as investments', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 1000), on(1, 1, -500)],
      investments: [on(1, 1, 500)],
      spending: [],
    }, range)

    // Buying an investment moves money rather than losing it: capital is unchanged. The
    // walk runs to the last month with anything in it, which is February here.
    expect(points.map((point) => [point.capital, point.investments])).toEqual([[1000, 0], [1000, 500]])
  })

  it('uses history before the window to open at the right number', () => {
    const points = capitalEvolution({
      movements: [{ date: Date.UTC(2025, 11, 1), value: 100 }, on(0, 1, -20)],
      investments: [],
      spending: [],
    }, { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31) })

    expect(points).toEqual([{ month: '2026-01', capital: 80, investments: 0, income: -20, spending: 0 }])
  })

  it('says nothing when there is nothing, rather than a row of zeroes', () => {
    expect(capitalEvolution({ movements: [], investments: [], spending: [] }, range)).toEqual([])
  })

  it('leaves out a date nothing could read, which would otherwise never be walked to', () => {
    const points = capitalEvolution({
      movements: [on(0, 5, 100), { date: Number.NaN, value: -50 }],
      investments: [],
      spending: [],
    }, range)

    expect(points).toEqual([{ month: '2026-01', capital: 100, investments: 0, income: 100, spending: 0 }])
  })
})
