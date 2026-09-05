import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { withDerivedSections } from './label-catalogue'
import { resolveConfirmedField, resolveSourceField } from './ingestion-fields'
import { applyLabelRules, ruleStats, type StoredRule } from './label-rules'
import { confirmedRowsTable, ingestionAuditEventsTable, labelRulesTable, sourceRowsTable } from './model-db'
import type { ConfirmedRow, LabelRule, RuleContext, SourceRow } from './types'

export async function listLabelRules(context?: RuleContext): Promise<StoredRule[]> {
  const rows = await labelRulesTable.toArray()
  return rows
    .map((row) => ({ id: row.id, ...(row.data as LabelRule) }))
    .filter((rule) => !context || rule.context === context)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export async function saveLabelRule(rule: LabelRule): Promise<number> {
  return labelRulesTable.add({ createdAt: Date.now(), data: rule })
}

export async function updateLabelRule(id: number, rule: LabelRule): Promise<void> {
  await labelRulesTable.update(id, { data: rule })
}

/** Removing a rule leaves the rows it labelled exactly as they are; only the standing decision goes. */
export async function deleteLabelRule(id: number): Promise<void> {
  await labelRulesTable.delete(id)
}

export interface RuleRunResult {
  rowsTouched: number
  byRule: { ruleId: number; name: string; rowsFilled: number }[]
}

/**
 * Runs the standing rules of one context over the rows that context holds.
 *
 * Source rules run as a file arrives, which is what lets rows start labelled instead of
 * empty. Confirmed rules run over confirmed rows on demand. Neither is bound to a table:
 * a rule that should only touch one narrows itself with a condition on the labels, which
 * keeps "where this applies" in the same place as "what this means".
 */
export async function applyLabelRulesToRows(context: RuleContext, translate: (key: string) => string, rowIds?: number[]): Promise<RuleRunResult> {
  const rules = await listLabelRules(context)
  const result: RuleRunResult = { rowsTouched: 0, byRule: rules.map((rule) => ({ ruleId: rule.id, name: rule.name || rule.contains, rowsFilled: 0 })) }
  if (rules.length === 0) return result

  const catalogue = await loadLabelCatalogue(translate)
  const table = context === 'source' ? sourceRowsTable : confirmedRowsTable
  const only = rowIds && rowIds.length > 0 ? rowIds : undefined

  for (const record of await table.toArray()) {
    if (only && !only.includes(record.id)) continue

    if (context === 'source') {
      const row = record.data as SourceRow
      const applied = applyLabelRules(row.labels, rules, (field) => resolveSourceField(row, field))
      if (applied.filled.length === 0) continue
      await table.update(record.id, {
        data: { ...row, labels: withDerivedSections(applied.labels, catalogue), appliedRuleIds: applied.appliedRuleIds } satisfies SourceRow,
      })
      result.rowsTouched += 1
      for (const filled of applied.filled) {
        const entry = result.byRule.find((candidate) => candidate.ruleId === filled.ruleId)
        if (entry) entry.rowsFilled += 1
      }
      continue
    }

    // A confirmed row's placement is already spent — it is what put the row in this
    // table — so a confirmed rule may only fill in what a row means.
    const row = record.data as ConfirmedRow
    const applied = applyLabelRules({ category: row.category, subcategory: row.subcategory }, rules, (field) => resolveConfirmedField(row, field))
    if (applied.filled.length === 0) continue
    await table.update(record.id, {
      data: { ...row, category: applied.labels.category ?? row.category, subcategory: applied.labels.subcategory ?? row.subcategory } satisfies ConfirmedRow,
    })
    result.rowsTouched += 1
    for (const filled of applied.filled) {
      const entry = result.byRule.find((candidate) => candidate.ruleId === filled.ruleId)
      if (entry) entry.rowsFilled += 1
    }
  }

  if (result.rowsTouched > 0) {
    await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rulesApplied', actor: 'user', details: { context, ...result } } })
  }
  return result
}

/** Every rule with what it can honestly claim, for the rules list and its detail view. */
export async function labelRulesWithStats(context?: RuleContext) {
  const [rules, sourceRows, confirmedRows] = await Promise.all([listLabelRules(context), sourceRowsTable.toArray(), confirmedRowsTable.toArray()])
  return rules.map((rule) => ({
    rule,
    stats: rule.context === 'source'
      ? ruleStats(rule, sourceRows.map((row) => ({ labels: (row.data as SourceRow).labels, appliedRuleIds: (row.data as SourceRow).appliedRuleIds, confirmed: false, text: (field: string) => resolveSourceField(row.data as SourceRow, field) })))
      : ruleStats(rule, confirmedRows.map((row) => {
        const confirmed = row.data as ConfirmedRow
        return {
          labels: { category: confirmed.category, subcategory: confirmed.subcategory },
          appliedRuleIds: undefined,
          confirmed: true,
          text: (field: string) => resolveConfirmedField(confirmed, field),
        }
      })),
  }))
}
