import { describe, expect, it } from 'vitest'
import { inferInvestmentClass } from './investment-class'

describe('inferInvestmentClass', () => {
  it('recognizes legacy and common fixed-income table names', () => {
    expect(inferInvestmentClass('Renda Fixa')).toBe('fixedIncome')
    expect(inferInvestmentClass('CDB Banco X')).toBe('fixedIncome')
  })

  it('keeps old unclassified investment tables in Variable Income', () => {
    expect(inferInvestmentClass('Minha carteira')).toBe('variableIncome')
  })
})
