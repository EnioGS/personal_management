import { describe, expect, it } from 'vitest'
import { capitalMetric, comparison } from './capital-metric'
import type { CapitalEvolutionPoint } from './capital-evolution'

const money = (value: number) => `R$ ${value.toFixed(0)}`
const labels = { lastMonth: 'vs. last month', sinceMonth: (month: string) => `vs. ${month}` }

function points(...capitals: number[]): CapitalEvolutionPoint[] {
  return capitals.map((capital, index) => ({
    month: `2026-0${index + 1}`,
    capital,
    investments: 0,
    income: 0,
    spending: 0,
    arrived: 0,
  }))
}

describe('comparison', () => {
  it('reports the amount that changed, and its share of what it was', () => {
    expect(comparison(120, 100, 'up', 'vs. last month', money)).toEqual({
      change: 'R$ 20', percent: 0.2, direction: 'up', goodDirection: 'up', label: 'vs. last month',
    })
  })

  it('leaves out a percentage of nothing, which would be infinite rather than informative', () => {
    expect(comparison(120, 0, 'up', 'x', money)).toMatchObject({ change: 'R$ 120', percent: undefined, direction: 'up' })
  })

  it('leaves out a percentage of a debt, which moves the opposite way to the number', () => {
    expect(comparison(-100, -200, 'up', 'x', money)).toMatchObject({ change: 'R$ 100', percent: undefined, direction: 'up' })
  })

  it('leaves out a percentage so large it describes the base rather than the change', () => {
    // The 2624% that started this: a month that netted almost nothing, compared against.
    expect(comparison(6000, 220, 'up', 'x', money)).toMatchObject({ change: 'R$ 5780', percent: undefined })
    expect(comparison(1100, 100, 'up', 'x', money)).toMatchObject({ percent: 10 })
  })

  it('calls a change of cents flat rather than pretending at a direction', () => {
    expect(comparison(100.001, 100, 'up', 'x', money)).toMatchObject({ direction: 'flat' })
  })
})

describe('capitalMetric', () => {
  it('compares against last month and against the first month its line draws', () => {
    const metric = capitalMetric(points(10, 20, 30, 40, 50, 60), 'capital', 'up', labels, money)

    expect(metric.current).toBe(60)
    expect(metric.sparkline).toEqual([30, 40, 50, 60])
    expect(metric.deltas.map((delta) => [delta.label, delta.change])).toEqual([
      ['vs. last month', 'R$ 10'],
      ['vs. 2026-03', 'R$ 30'],
    ])
  })

  it('says one thing once when the line starts at last month', () => {
    expect(capitalMetric(points(10, 20), 'capital', 'up', labels, money).deltas).toHaveLength(1)
  })

  it('compares against nothing when there is one month, and nothing when there are none', () => {
    expect(capitalMetric(points(10), 'capital', 'up', labels, money).deltas).toEqual([])
    expect(capitalMetric([], 'capital', 'up', labels, money)).toMatchObject({ current: 0, deltas: [] })
  })
})
