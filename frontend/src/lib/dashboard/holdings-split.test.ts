import { describe, expect, it } from 'vitest'
import { heldDelta, holdingsByCategory, holdingsSplit } from './holdings-split'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

function investment(overrides: Partial<FilteredEntry>): FilteredEntry {
  return {
    rowId: crypto.randomUUID(),
    section: 'finances',
    screen: 'investments',
    date: Date.UTC(2026, 0, 1),
    value: -1000,
    category: '',
    subcategory: '',
    observations: '{}',
    description: 'Aplicação',
    sourceFilename: 'corretora.csv',
    ...overrides,
  }
}

const groupFor = (rows: FilteredEntry[], key: string) => holdingsSplit(rows).find((group) => group.key === key)

describe('which pot a row is about', () => {
  it('reads a fund row from the cash that paid for it: money out is money held', () => {
    expect(heldDelta(investment({ category: 'fixed income', value: -1049.69 }))).toBe(1049.69)
    expect(heldDelta(investment({ category: 'fixed income', value: 2094.37 }))).toBe(-2094.37)
  })

  it('reads a cash row as itself: money stored is money held', () => {
    expect(heldDelta(investment({ category: 'cash', subcategory: 'cash flow', value: 100 }))).toBe(100)
  })
})

describe('holdingsSplit', () => {
  // The rows as they actually stand: one open Tesouro prefixado, an IPCA+ position bought
  // and fully redeemed, and a hundred left in the reserve.
  const rows = [
    investment({ category: 'cash', subcategory: 'cash flow', value: 1000, date: Date.UTC(2026, 8, 5) }),
    investment({ category: 'cash', subcategory: 'cash flow', value: 100, date: Date.UTC(2026, 8, 5) }),
    investment({ category: 'cash', subcategory: 'cash flow', value: -1000, date: Date.UTC(2026, 8, 5) }),
    investment({ category: 'cash', subcategory: 'proceeds', value: 66.49 }),
    investment({ category: 'fixed income', subcategory: 'tesouro - prefixado', value: -1049.69 }),
    investment({ category: 'fixed income', subcategory: 'tesouro - IPCA+', value: -2094.37 }),
    investment({ category: 'fixed income', subcategory: 'tesouro - IPCA+', value: 2094.37 }),
  ]

  it('classes a row by what any of its labels says, not by one field', () => {
    expect(groupFor(rows, 'fixedIncome')?.value).toBeCloseTo(1049.69)
    expect(groupFor(rows, 'cash')?.value).toBeCloseTo(166.49)
  })

  it('breaks a class into what is held inside it, dropping what was redeemed to nothing', () => {
    expect(groupFor(rows, 'fixedIncome')?.children).toEqual([
      { key: 'fixedIncome:tesouro - prefixado', label: 'tesouro - prefixado', value: 1049.69 },
    ])
  })

  it('always answers for the three classes, holding anything or not', () => {
    expect(holdingsSplit([]).map((group) => group.key)).toEqual(['cash', 'fixedIncome', 'variableIncome'])
  })

  it('adds the unclassified only when something is in it', () => {
    const withStrays = holdingsSplit([investment({ category: 'crypto', value: -500 })])
    expect(withStrays.map((group) => group.key)).toContain('unclassified')
    expect(withStrays.find((group) => group.key === 'unclassified')?.value).toBe(500)
  })

  it('floors a class that has given back more than it ever held', () => {
    expect(groupFor([investment({ category: 'fixed income', value: 900 })], 'fixedIncome')?.value).toBe(0)
  })
})

describe('what is held, by what the user calls it', () => {
  it('groups by category with the subcategories under it, biggest first', () => {
    const held = holdingsByCategory([
      investment({ category: 'tesouro', subcategory: 'IPCA+ 2029', value: -1000, class: 'renda fixa' }),
      investment({ category: 'tesouro', subcategory: 'prefixado 2029', value: -400, class: 'renda fixa' }),
      investment({ category: 'ações', subcategory: 'PETR4', value: -600, class: 'renda variável' }),
    ])

    expect(held.map((group) => [group.label, group.value])).toEqual([['tesouro', 1400], ['ações', 600]])
    expect(held[0].children?.map((child) => child.label)).toEqual(['IPCA+ 2029', 'prefixado 2029'])
  })

  it('leaves out a position that has been closed, which is not a position', () => {
    const held = holdingsByCategory([
      investment({ category: 'tesouro', subcategory: 'selic', value: -500, class: 'renda fixa' }),
      investment({ category: 'tesouro', subcategory: 'selic', value: 500, class: 'renda fixa' }),
    ])

    expect(held).toEqual([])
  })
})