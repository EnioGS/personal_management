import { describe, expect, it } from 'vitest'
import { computePositions, getCurrentValue, type Transaction } from './current-value'

describe('getCurrentValue', () => {
  it('computes quantity × last price for a buy-then-sell-then-buy sequence', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'sell', quantity: 4, price: 6 },
      { date: 3, asset: 'ABC', type: 'buy', quantity: 2, price: 7 },
    ]

    // remaining quantity = 10 - 4 + 2 = 8, last price = 7
    expect(getCurrentValue('ABC', transactions)).toBe(56)
  })

  it('ignores transactions for other assets', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'XYZ', type: 'buy', quantity: 100, price: 1 },
    ]

    expect(getCurrentValue('ABC', transactions)).toBe(50)
  })

  it('returns 0 for an asset with no transactions', () => {
    expect(getCurrentValue('NONE', [])).toBe(0)
  })

  it('does not let separately paid income change a holding quantity or price', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'CDB', type: 'buy', quantity: 2, price: 100 },
      { date: 2, asset: 'CDB', type: 'income', quantity: 1, price: 15 },
    ]

    expect(getCurrentValue('CDB', transactions)).toBe(200)
    expect(computePositions(transactions)).toEqual([{ asset: 'CDB', quantity: 2, averagePrice: 100, currentValue: 200 }])
  })
})

describe('computePositions', () => {
  it('computes quantity, average buy price and current value per asset', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'buy', quantity: 10, price: 7 },
    ]

    // average price weighted by quantity: (10*5 + 10*7) / 20 = 6
    expect(computePositions(transactions)).toEqual([
      { asset: 'ABC', quantity: 20, averagePrice: 6, currentValue: 140 },
    ])
  })

  it('excludes an asset fully sold off — a closed position is not a current holding', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'sell', quantity: 10, price: 6 },
    ]

    expect(computePositions(transactions)).toEqual([])
  })

  it('is unaffected by sells for the average price — only buys were actually paid for', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'sell', quantity: 4, price: 100 },
    ]

    expect(computePositions(transactions)[0].averagePrice).toBe(5)
  })

  it('ignores soft-deleted transactions', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 2, asset: 'ABC', type: 'buy', quantity: 10, price: 5, deleted: true },
    ]

    expect(computePositions(transactions)[0].quantity).toBe(10)
  })

  it('keeps positions independent across assets', () => {
    const transactions: Transaction[] = [
      { date: 1, asset: 'ABC', type: 'buy', quantity: 10, price: 5 },
      { date: 1, asset: 'XYZ', type: 'buy', quantity: 4, price: 20 },
    ]

    const positions = computePositions(transactions)
    expect(positions.map((p) => p.asset).sort()).toEqual(['ABC', 'XYZ'])
  })
})
