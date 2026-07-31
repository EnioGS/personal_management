import { describe, expect, it } from 'vitest'
import { getCurrentValue, type Transaction } from './current-value'

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
})
