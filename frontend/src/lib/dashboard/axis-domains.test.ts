import { describe, expect, it } from 'vitest'
import { alignedDomains } from './axis-domains'

describe('two scales on one chart', () => {
  it('gives each the room its own numbers need', () => {
    // Capital in the tens of thousands, a month's flows in the thousands.
    const { totals, flows } = alignedDomains({ min: 0, max: 25_000 }, { min: -10_000, max: 8_000 })

    expect(totals[1]).toBe(25_000)
    expect(flows[1]).toBe(8_000)
  })

  it('puts both zeros at the same height, so one line is not two', () => {
    const { totals, flows } = alignedDomains({ min: 0, max: 25_000 }, { min: -10_000, max: 8_000 })
    const share = ([min, max]: [number, number]) => -min / (max - min)

    expect(share(totals)).toBeCloseTo(share(flows), 6)
  })

  it('leaves an axis alone when nothing anywhere is negative', () => {
    expect(alignedDomains({ min: 0, max: 100 }, { min: 0, max: 50 })).toEqual({ totals: [0, 100], flows: [0, 50] })
  })

  it('stretches the one with less below, never shrinking the one with more', () => {
    const { totals } = alignedDomains({ min: -100, max: 100 }, { min: -900, max: 100 })

    // The flows sit nine tenths below zero, so the totals axis has to as well.
    expect(totals[0]).toBeCloseTo(-900, 6)
  })
})
