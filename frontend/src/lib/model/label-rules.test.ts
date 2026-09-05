import { describe, expect, it } from 'vitest'
import { applyLabelRules, conditionHolds, ruleApplies, ruleStats, type StoredRule } from './label-rules'

function rule(overrides: Partial<StoredRule> = {}): StoredRule {
  return {
    id: 1,
    context: 'source',
    field: 'description',
    contains: 'netflix',
    labels: { category: 'assinaturas' },
    createdBy: 'assistant',
    createdAt: 1,
    ...overrides,
  }
}

describe('how a rule matches', () => {
  it('is a substring by default, accents and case aside', () => {
    expect(conditionHolds({ contains: 'sao jorge' }, 'MERCADO SÃO JORGE')).toBe(true)
    expect(conditionHolds({ contains: 'padaria' }, 'MERCADO SÃO JORGE')).toBe(false)
  })

  it('can be the whole value or its start, which is what a short name needs', () => {
    expect(conditionHolds({ contains: 'of', match: 'equals' }, 'Microsoft')).toBe(false)
    expect(conditionHolds({ contains: 'of' }, 'Microsoft')).toBe(true)
    expect(conditionHolds({ contains: 'micro', match: 'startsWith' }, 'Microsoft 365')).toBe(true)
  })

  it('can be a regular expression, and a broken one matches nothing rather than throwing', () => {
    expect(conditionHolds({ contains: 'uber\\s*(eats|trip)', match: 'regex' }, 'UBER EATS')).toBe(true)
    expect(conditionHolds({ contains: 'uber(', match: 'regex' }, 'UBER EATS')).toBe(false)
  })

  it('holds only when every stacked condition does — which is how a rule is narrowed to one file', () => {
    const narrowed = rule({ contains: 'uber', where: [{ field: 'source_filename', contains: 'cartao' }] })
    const values: Record<string, Record<string, string>> = {
      card: { description: 'UBER *TRIP', source_filename: 'cartao-agosto.csv' },
      bank: { description: 'UBER *TRIP', source_filename: 'banco-agosto.csv' },
    }

    expect(ruleApplies(narrowed, (field) => values.card[field])).toBe(true)
    expect(ruleApplies(narrowed, (field) => values.bank[field])).toBe(false)
  })
})

describe('what a rule may change', () => {
  const resolve = () => 'NETFLIX.COM'

  it('fills only what the row does not already say', () => {
    const applied = applyLabelRules({ category: 'streaming' }, [rule()], resolve)

    expect(applied.labels.category).toBe('streaming')
    expect(applied.filled).toEqual([])
  })

  it('treats the default meaning as unsaid, so a rule may sharpen "outros"', () => {
    const applied = applyLabelRules({ category: 'outros', subcategory: 'outros' }, [rule()], resolve)

    expect(applied.labels.category).toBe('assinaturas')
    expect(applied.appliedRuleIds).toEqual([1])
  })

  it('lets two matching rules compose rather than fight', () => {
    const applied = applyLabelRules({}, [
      rule({ id: 1, labels: { category: 'assinaturas' } }),
      rule({ id: 2, labels: { screens: ['spending'], category: 'never used' } }),
    ], resolve)

    expect(applied.labels).toEqual({ category: 'assinaturas', screens: ['spending'] })
    expect(applied.appliedRuleIds).toEqual([1, 2])
  })

  it('records itself on the row, which is what lets it report on itself later', () => {
    expect(applyLabelRules({}, [rule()], resolve).filled).toEqual([{ ruleId: 1, fields: ['category'] }])
  })
})

describe('what a rule can honestly claim', () => {
  it('separates rows confirmed with its labels intact from rows that overrode it', () => {
    const stats = ruleStats(rule(), [
      { labels: { category: 'assinaturas' }, appliedRuleIds: [1], confirmed: true, text: () => 'NETFLIX' },
      { labels: { category: 'lazer' }, appliedRuleIds: [1], confirmed: true, text: () => 'NETFLIX' },
      { labels: { category: 'assinaturas' }, appliedRuleIds: [1], confirmed: false, text: () => 'NETFLIX' },
    ])

    expect(stats).toMatchObject({ applied: 3, confirmedRespected: 1, overridden: 1, pending: 1 })
  })
})

describe('a rule that says nothing about a label', () => {
  it('is not judged on it: only what it sets can be respected or overridden', () => {
    const cardRule = rule({ labels: { card: 'Nubank - Main credit card' } })
    const stats = ruleStats(cardRule, [
      // Kept what the rule said, and holds a category the rule never mentioned.
      { labels: { card: 'Nubank - Main credit card', category: 'cartão' }, confirmed: true, text: () => 'NETFLIX' },
      // Somebody chose a different card by hand. That is what overriding means.
      { labels: { card: 'Another card' }, confirmed: true, text: () => 'NETFLIX' },
    ])

    expect(stats).toMatchObject({ applied: 2, confirmedRespected: 1, overridden: 1 })
  })
})

describe('the class label', () => {
  it('is a label a rule can fill, like every other', () => {
    const applied = applyLabelRules({}, [rule({ contains: 'tesouro', labels: { class: 'renda fixa' } })], () => 'TESOURO IPCA 2029')

    expect(applied.labels.class).toBe('renda fixa')
  })

  it('is left alone when the row already says what kind of thing it is', () => {
    const applied = applyLabelRules(
      { class: 'cash reserve' },
      [rule({ contains: 'tesouro', labels: { class: 'renda fixa' } })],
      () => 'TESOURO IPCA 2029',
    )

    expect(applied.labels.class).toBe('cash reserve')
  })
})
