import { describe, expect, it } from 'vitest'
import { capitalEvolution } from './capital-evolution'

describe('capitalEvolution', () => {
  it('carries the running capital across months while grouping card spend separately', () => {
    const points = capitalEvolution([
      { date: Date.UTC(2026, 0, 5), amount: 100, direction: 'in' },
      { date: Date.UTC(2026, 0, 8), amount: 30, direction: 'out' },
      { date: Date.UTC(2026, 2, 2), amount: 20, direction: 'out', cardId: 1, financeDestination: 'spending', spendingTreatment: 'expense' },
      { date: Date.UTC(2026, 2, 5), amount: 5, direction: 'in', cardId: 1, financeDestination: 'spending', spendingTreatment: 'rebate' },
    ], { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 31) })

    expect(points).toEqual([
      { month: '2026-01', cashCapital: 70, variableIncome: 0, fixedIncome: 0, capital: 70, cardSpend: 0 },
      { month: '2026-02', cashCapital: 70, variableIncome: 0, fixedIncome: 0, capital: 70, cardSpend: 0 },
      { month: '2026-03', cashCapital: 70, variableIncome: 0, fixedIncome: 0, capital: 70, cardSpend: 15 },
    ])
  })

  it('uses history before the displayed range to calculate the correct opening capital', () => {
    const points = capitalEvolution([
      { date: Date.UTC(2025, 11, 1), amount: 100, direction: 'in' },
      { date: Date.UTC(2026, 0, 1), amount: 20, direction: 'out' },
    ], { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31) })

    expect(points).toEqual([{ month: '2026-01', cashCapital: 80, variableIncome: 0, fixedIncome: 0, capital: 80, cardSpend: 0 }])
  })

  it('starts at the earliest month across cash and investments, and adds both investment values to capital', () => {
    const points = capitalEvolution(
      [{ date: Date.UTC(2026, 1, 4), amount: 50, direction: 'in' }],
      { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 31) },
      [
        { date: Date.UTC(2026, 0, 8), asset: 'PETR4', type: 'buy', quantity: 10, price: 5, investmentClass: 'variableIncome' },
        { date: Date.UTC(2026, 2, 5), asset: 'CDB', type: 'buy', quantity: 2, price: 100, investmentClass: 'fixedIncome' },
        { date: Date.UTC(2026, 2, 20), asset: 'PETR4', type: 'buy', quantity: 1, price: 6, investmentClass: 'variableIncome' },
      ],
    )

    expect(points).toEqual([
      { month: '2026-01', cashCapital: 0, variableIncome: 50, fixedIncome: 0, capital: 50, cardSpend: 0 },
      { month: '2026-02', cashCapital: 50, variableIncome: 50, fixedIncome: 0, capital: 100, cardSpend: 0 },
      { month: '2026-03', cashCapital: 50, variableIncome: 56, fixedIncome: 200, capital: 306, cardSpend: 0 },
    ])
  })

  it('adds purchases, subtracts sales by their recorded values, and ignores deleted rows in either investment class', () => {
    const points = capitalEvolution(
      [],
      { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 31) },
      [
        { date: Date.UTC(2026, 0, 5), asset: 'ETF', type: 'buy', quantity: 2, price: 50, investmentClass: 'variableIncome' },
        { date: Date.UTC(2026, 1, 5), asset: 'ETF', type: 'sell', quantity: 2, price: 60, investmentClass: 'variableIncome' },
        { date: Date.UTC(2026, 0, 5), asset: 'CDB', type: 'buy', quantity: 1, price: 100, investmentClass: 'fixedIncome', deleted: true },
      ],
    )

    expect(points).toEqual([
      { month: '2026-01', cashCapital: 0, variableIncome: 100, fixedIncome: 0, capital: 100, cardSpend: 0 },
      { month: '2026-02', cashCapital: 0, variableIncome: -20, fixedIncome: 0, capital: -20, cardSpend: 0 },
    ])
  })

  it('returns a fully redeemed fixed-income history to zero from its transaction values', () => {
    const transactions = [
      ['2023-08-01', 'buy', 7111.42],
      ['2023-08-14', 'sell', 1606.33],
      ['2023-08-18', 'sell', 1276.08],
      ['2023-09-01', 'sell', 3859.22],
      ['2025-06-03', 'buy', 7226.08],
      ['2025-08-26', 'buy', 2086.64],
      ['2025-12-08', 'sell', 1574.91],
      ['2026-01-13', 'sell', 355.79],
      ['2026-02-02', 'sell', 4071.35],
      ['2026-02-04', 'sell', 1586.09],
      ['2026-02-04', 'sell', 2094.37],
    ] as const
    const points = capitalEvolution(
      [],
      { from: Date.UTC(2023, 7, 1), to: Date.UTC(2026, 1, 28) },
      transactions.map(([date, type, price], index) => ({
        date: Date.parse(date),
        asset: `Tesouro ${index}`,
        type,
        quantity: 1,
        price,
        investmentClass: 'fixedIncome' as const,
      })),
    )

    expect(points.at(-1)).toMatchObject({ fixedIncome: 0, capital: 0 })
  })

  it('keeps separately paid investment income out of the invested-capital balance', () => {
    const points = capitalEvolution(
      [],
      { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31) },
      [
        { date: Date.UTC(2026, 0, 1), asset: 'CDB', type: 'buy', quantity: 1, price: 100, investmentClass: 'fixedIncome' },
        { date: Date.UTC(2026, 0, 2), asset: 'CDB', type: 'income', quantity: 1, price: 15, investmentClass: 'fixedIncome' },
      ],
    )

    expect(points).toEqual([{ month: '2026-01', cashCapital: 0, variableIncome: 0, fixedIncome: 100, capital: 100, cardSpend: 0 }])
  })
})
