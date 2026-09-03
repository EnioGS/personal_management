import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { applyLabelRules, ruleStats, type StoredRule } from './label-rules'
import { applyLabelRulesToRows, labelRulesWithStats, saveLabelRule } from './label-rules-repository'
import { ingestionRowsTable, tableDefsTable } from './model-db'
import type { IngestionRow } from './types'

const resolve = (row: IngestionRow, field: string) => (field === 'description' ? row.mappedValues.description : row.rawValues[field])

function rule(overrides: Partial<StoredRule> = {}): StoredRule {
  return {
    id: 1,
    field: 'description',
    contains: 'pagamento de fatura',
    labels: { financeDestination: 'movements', flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' },
    destinationTableId: 7,
    createdBy: 'assistant',
    createdAt: 1,
    ...overrides,
  }
}

function row(overrides: Partial<IngestionRow> = {}): IngestionRow {
  return {
    sourceId: 1,
    sourceRowIndex: 0,
    sourceRowFingerprint: 'r0',
    rawValues: {},
    mappedValues: { description: 'Pagamento de fatura' },
    labels: {},
    status: 'unlabelled',
    validationErrors: [],
    ...overrides,
  }
}

describe('applying standing rules', () => {
  it('fills a matching row, whatever the case or accents', () => {
    const result = applyLabelRules(row({ mappedValues: { description: 'PAGAMENTO DE FATURA' } }), [rule()], resolve)

    expect(result.labels).toMatchObject({ financeDestination: 'movements', flowRole: 'outflow' })
    expect(result.destinationTableId).toBe(7)
    expect(result.appliedRuleIds).toEqual([1])
    expect(result.filled[0].fields).toContain('flowRole')
  })

  it('leaves a row it does not match alone', () => {
    const result = applyLabelRules(row({ mappedValues: { description: 'Amazonprimebr' } }), [rule()], resolve)

    expect(result.labels).toEqual({})
    expect(result.appliedRuleIds).toEqual([])
  })

  it('never overwrites a decision already on the row', () => {
    const decided = row({ labels: { flowRole: 'transfer' } })

    const result = applyLabelRules(decided, [rule()], resolve)

    expect(result.labels.flowRole).toBe('transfer')
    expect(result.labels.settlementChannel).toBe('checkingAccount')
    expect(result.filled[0].fields).not.toContain('flowRole')
  })

  it('lets two rules compose, the first to match a field keeping it', () => {
    const second = rule({ id: 2, contains: 'fatura', labels: { flowRole: 'inflow', recurrence: 'recurring' } })

    const result = applyLabelRules(row(), [rule(), second], resolve)

    expect(result.labels.flowRole).toBe('outflow')
    expect(result.appliedRuleIds).toEqual([1])
  })

  it('is safe to run twice', () => {
    const once = applyLabelRules(row(), [rule()], resolve)
    const twice = applyLabelRules(row({ labels: once.labels, destinationTableId: once.destinationTableId, appliedRuleIds: once.appliedRuleIds }), [rule()], resolve)

    expect(twice.appliedRuleIds).toEqual([1])
    expect(twice.filled).toEqual([])
  })
})

describe('what a rule may claim', () => {
  it('counts only confirmed rows whose labels the rule still owns', () => {
    const rows = [
      row({ status: 'promoted', appliedRuleIds: [1], labels: rule().labels, destinationTableId: 7 }),
      row({ status: 'promoted', appliedRuleIds: [1], labels: { ...rule().labels, flowRole: 'inflow' }, destinationTableId: 7 }),
      row({ status: 'ready', appliedRuleIds: [1], labels: rule().labels, destinationTableId: 7 }),
      row({ status: 'promoted', labels: rule().labels }),
    ]

    expect(ruleStats(rule(), rows, resolve)).toMatchObject({ applied: 3, confirmedRespected: 1, overridden: 1, pending: 1 })
  })

  it('still credits a rule when labels it never set were filled in by hand', () => {
    const partial = rule({ labels: { flowRole: 'outflow' }, destinationTableId: undefined })
    const rows = [row({ status: 'promoted', appliedRuleIds: [1], labels: { flowRole: 'outflow', settlementChannel: 'creditCard', recurrence: 'recurring' } })]

    expect(ruleStats(partial, rows, resolve).confirmedRespected).toBe(1)
  })

  it('lists the distinct strings it matched', () => {
    const rows = [
      row({ appliedRuleIds: [1], mappedValues: { description: 'Pagamento de fatura' } }),
      row({ appliedRuleIds: [1], mappedValues: { description: 'PAGAMENTO DE FATURA' } }),
      row({ appliedRuleIds: [1], mappedValues: { description: 'Pagamento de fatura' } }),
    ]

    // Two spellings of one narration, listed once each: the strings are what a rule is
    // judged on later, so the casing it actually met is kept rather than folded away.
    expect(ruleStats(rule(), rows, resolve).matchedStrings).toEqual(['Pagamento de fatura', 'PAGAMENTO DE FATURA'])
  })
})

describe('rules meeting real rows', () => {
  beforeEach(async () => { await wipeAllData() })

  it('fills staged rows as they arrive, and a fully covered row lands ready', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Extrato Nubank', kind: 'bankLedger' } })
    await saveLabelRule({ field: 'description', contains: 'pagamento de fatura', labels: { financeDestination: 'movements', flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' }, destinationTableId: tableId, rationale: 'Paying the card bill moves money out of checking; the purchases are already counted on the card side.', createdBy: 'assistant', createdAt: 1 })
    const rowId = await ingestionRowsTable.add({ createdAt: 2, data: { sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r0', rawValues: {}, mappedValues: { date: '2026-01-02', amount: '2539.24', description: 'Pagamento de fatura', direction: 'out', rawCategory: 'Pagamento' }, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow })

    const result = await applyLabelRulesToRows()

    expect(result).toMatchObject({ rowsTouched: 1, becameReady: 1 })
    const stored = (await ingestionRowsTable.get(rowId))!.data as IngestionRow
    expect(stored.status).toBe('ready')
    expect(stored.appliedRuleIds).toHaveLength(1)
  })

  it('reports a rule by what it can claim, not by what it touched', async () => {
    const ruleId = await saveLabelRule({ field: 'description', contains: 'amazonprime', labels: { recurrence: 'recurring' }, rationale: 'Amazon Prime is a monthly subscription.', createdBy: 'user', createdAt: 1 })
    const base = { sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r', rawValues: {}, mappedValues: { description: 'Amazonprimebr' }, validationErrors: [] }
    await ingestionRowsTable.add({ createdAt: 2, data: { ...base, labels: { recurrence: 'recurring' }, appliedRuleIds: [ruleId], status: 'promoted' } as IngestionRow })
    await ingestionRowsTable.add({ createdAt: 3, data: { ...base, labels: { recurrence: 'oneOff' }, appliedRuleIds: [ruleId], status: 'promoted' } as IngestionRow })

    const [{ stats }] = await labelRulesWithStats()

    expect(stats).toMatchObject({ applied: 2, confirmedRespected: 1, overridden: 1 })
  })
})
