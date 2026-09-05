import { describe, expect, it } from 'vitest'
import { applySignConvention, shapeOfAmounts } from './sign-convention'
import type { SignConvention } from './types'

describe('making a file agree with us', () => {
  it('leaves a file alone that already means what we mean', () => {
    expect(applySignConvention(-10, { kind: 'asImported' }, {})).toBe(-10)
    expect(applySignConvention(10, { kind: 'asImported' }, {})).toBe(10)
  })

  it('inverts a file that consistently means the opposite', () => {
    expect(applySignConvention(10, { kind: 'invertAll' }, {})).toBe(-10)
    expect(applySignConvention(-10, { kind: 'invertAll' }, {})).toBe(10)
  })

  it('reads direction from another column, ignoring the sign the file happened to write', () => {
    const convention: SignConvention = { kind: 'invertWhen', column: 'Tipo', values: ['D', 'debito'] }

    expect(applySignConvention(10, convention, { Tipo: 'D' })).toBe(-10)
    expect(applySignConvention(-10, convention, { Tipo: ' debito ' })).toBe(-10)
    expect(applySignConvention(-10, convention, { Tipo: 'C' })).toBe(10)
  })

  it('has nothing to say about a row with no amount', () => {
    expect(applySignConvention(null, { kind: 'invertAll' }, {})).toBeNull()
  })
})

describe('the evidence a sign decision is made from', () => {
  it('counts the signs and the extremes, reading the numbers the way statements write them', () => {
    expect(shapeOfAmounts(['-284,90', '3.500,00', '', 'not a number', '-10'])).toEqual({
      count: 3,
      negatives: 2,
      positives: 1,
      min: -284.9,
      max: 3500,
    })
  })

  it('says so plainly when there is nothing to look at', () => {
    expect(shapeOfAmounts([])).toEqual({ count: 0, negatives: 0, positives: 0, min: null, max: null })
  })
})
