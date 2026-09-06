import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { refreshLocalStores } from '@/lib/local-store/create-local-list-store'
import type { LocalRow } from '@/lib/local-store/create-local-table'
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
  const id = await labelRulesTable.add({ createdAt: Date.now(), data: rule })
  await refreshLocalStores('labelRules')
  return id
}

/**
 * Rewrites a rule.
 *
 * A standing rule is a sentence about the data — the text it looks for, where it looks,
 * what it concludes — and any of those can turn out to be slightly wrong: a match too
 * broad, a label that was right last month, a rationale that no longer says why. Rewriting
 * keeps the rule where it is, and what it has already labelled stays labelled: a rule
 * fills blanks, so its past is in the rows, not in itself.
 */
export async function updateLabelRule(id: number, rule: LabelRule, editedBy?: 'user' | 'assistant'): Promise<void> {
  await labelRulesTable.update(id, {
    data: editedBy ? { ...rule, editedBy, editedAt: Date.now() } : rule,
  })
  await refreshLocalStores('labelRules')
}

/** Removing a rule leaves the rows it labelled exactly as they are; only the standing decision goes. */
export async function deleteLabelRule(id: number): Promise<void> {
  await labelRulesTable.delete(id)
  await refreshLocalStores('labelRules')
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
export async function applyLabelRulesToRows(
  context: RuleContext,
  translate: (key: string) => string,
  rowIds?: number[],
  /**
   * Which rules to run, when the answer is not "all of them".
   *
   * Saving one rule used to run every standing rule over every row — hundreds of rows
   * touched to fill none, an audit nobody could read, and now a journal entry each. A rule
   * fills only what a row does not already say, so running the others changes nothing that
   * running them earlier did not already change.
   */
  onlyRuleIds?: number[],
): Promise<RuleRunResult> {
  const standing = await listLabelRules(context)
  const rules = onlyRuleIds && onlyRuleIds.length > 0
    ? standing.filter((rule) => onlyRuleIds.includes(rule.id))
    : standing
  const result: RuleRunResult = { rowsTouched: 0, byRule: rules.map((rule) => ({ ruleId: rule.id, name: rule.name || rule.contains, rowsFilled: 0 })) }
  if (rules.length === 0) return result

  const catalogue = await loadLabelCatalogue(translate)
  const table = context === 'source' ? sourceRowsTable : confirmedRowsTable
  const only = rowIds && rowIds.length > 0 ? rowIds : undefined
  // Collected and written once: rules run over every row after every upload, and a write
  // per row is a transaction per row.
  const updates: LocalRow[] = []

  for (const record of await table.toArray()) {
    if (only && !only.includes(record.id)) continue

    if (context === 'source') {
      const row = record.data as SourceRow
      const applied = applyLabelRules(row.labels, rules, (field) => resolveSourceField(row, field))
      if (applied.filled.length === 0) continue
      updates.push({
        ...record,
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
    // table — so a confirmed rule fills in everything else a row says about itself: what
    // it means, and which account and card it belongs to. Those two fell through this gap
    // before: a rule could be written with a card, was shown holding one, and did nothing
    // with it when it ran.
    const row = record.data as ConfirmedRow
    const applied = applyLabelRules(
      { category: row.category, subcategory: row.subcategory, account: row.account, card: row.card },
      rules,
      (field) => resolveConfirmedField(row, field),
    )
    if (applied.filled.length === 0) continue
    updates.push({
      ...record,
      data: {
        ...row,
        category: applied.labels.category ?? row.category,
        subcategory: applied.labels.subcategory ?? row.subcategory,
        account: applied.labels.account ?? row.account,
        card: applied.labels.card ?? row.card,
      } satisfies ConfirmedRow,
    })
    result.rowsTouched += 1
    for (const filled of applied.filled) {
      const entry = result.byRule.find((candidate) => candidate.ruleId === filled.ruleId)
      if (entry) entry.rowsFilled += 1
    }
  }

  if (updates.length > 0) await table.bulkPut(updates)
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
          // Every label a confirmed rule can set, so "did the row keep what the rule
          // said?" is asked of all of them. Comparing only the meaning meant a rule that
          // set an account or a card could never be respected: the labels it was checked
          // against did not contain the ones it sets, so every row it matched read as
          // having overridden it.
          labels: {
            category: confirmed.category,
            subcategory: confirmed.subcategory,
            account: confirmed.account,
            card: confirmed.card,
          },
          appliedRuleIds: undefined,
          confirmed: true,
          text: (field: string) => resolveConfirmedField(confirmed, field),
        }
      })),
  }))
}
