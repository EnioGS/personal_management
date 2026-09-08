import { describe, expect, it } from 'vitest'
import { extentOf } from './axis-domains'

describe('what the axis should span', () => {
  const rows = [
    { capital: 25_000, arrived: 8_000, spending: -6_000 },
    { capital: 17_000, arrived: 5_000, spending: -10_000 },
  ]

  it('runs from the lowest value drawn to the highest, not mirrored about zero', () => {
    const extent = extentOf(rows, ['capital', 'arrived', 'spending'])

    // The bottom is the deepest bar, so the space above is not halved to match it.
    expect(extent).toEqual({ min: -10_000, max: 25_000 })
  })

  it('keeps zero in view, since the bars are read against it', () => {
    expect(extentOf([{ capital: 12 }, { capital: 30 }], ['capital'])).toEqual({ min: 0, max: 30 })
    expect(extentOf([{ spending: -12 }], ['spending'])).toEqual({ min: -12, max: 0 })
  })

  it('ignores a series that is not there, rather than reading it as zero', () => {
    expect(extentOf([{ capital: 10, investments: null }], ['capital', 'investments'])).toEqual({ min: 0, max: 10 })
  })
})
