import { ingestionLabelErrors } from './ingestion'
import { ingestionFieldContext, resolveIngestionField } from './ingestion-fields'
import { applyLabelRules, ruleStats, type StoredRule } from './label-rules'
import {
  categoriesTable,
  ingestionAuditEventsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
  labelRulesTable,
  tableDefsTable,
} from './model-db'
import type { IngestionRow, LabelRule } from './types'

/** Field access for rules, built once per call rather than once per row. */
async function ruleFieldResolver() {
  const [sources, tables, categories] = await Promise.all([ingestionSourcesTable.toArray(), tableDefsTable.toArray(), categoriesTable.toArray()])
  const context = ingestionFieldContext(sources, tables, categories)
  return (row: IngestionRow, field: string) => resolveIngestionField(row, field, context)
}

export async function listLabelRules(): Promise<StoredRule[]> {
  const rows = await labelRulesTable.toArray()
  return rows.map((row) => ({ id: row.id, ...(row.data as LabelRule) })).sort((left, right) => right.createdAt - left.createdAt)
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
  becameReady: number
  byRule: { ruleId: number; name: string; rowsFilled: number }[]
}

/**
 * Runs the standing rules over rows that are still open, and revalidates each row it
 * touched — a row a rule completes becomes `ready` exactly as if the labels had been
 * typed, and one it only partly fills stays where it was with fewer blanks.
 */
export async function applyLabelRulesToRows(rowIds?: number[]): Promise<RuleRunResult> {
  const rules = await listLabelRules()
  const result: RuleRunResult = { rowsTouched: 0, becameReady: 0, byRule: rules.map((rule) => ({ ruleId: rule.id, name: rule.name || rule.contains, rowsFilled: 0 })) }
  if (rules.length === 0) return result

  const resolve = await ruleFieldResolver()
  const stored = await ingestionRowsTable.toArray()
  for (const record of stored) {
    const row = record.data as IngestionRow
    if (rowIds && !rowIds.includes(record.id)) continue
    if (row.status === 'promoted' || row.status === 'reconciledExisting' || row.status === 'discarded') continue

    const applied = applyLabelRules(row, rules, resolve)
    if (applied.filled.length === 0) continue

    const errors = ingestionLabelErrors(applied.labels, applied.destinationTableId)
    const next: IngestionRow = {
      ...row,
      labels: applied.labels,
      destinationTableId: applied.destinationTableId,
      appliedRuleIds: applied.appliedRuleIds,
      validationErrors: errors,
      status: errors.length === 0 ? 'ready' : row.status === 'ready' ? 'invalid' : row.status,
    }
    await ingestionRowsTable.update(record.id, { data: next })
    result.rowsTouched += 1
    if (next.status === 'ready') result.becameReady += 1
    for (const filled of applied.filled) {
      const entry = result.byRule.find((candidate) => candidate.ruleId === filled.ruleId)
      if (entry) entry.rowsFilled += 1
    }
  }

  if (result.rowsTouched > 0) {
    await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rulesApplied', actor: 'user', details: { ...result } } })
  }
  return result
}

/** Every rule with what it can honestly claim, for the rules list and its detail view. */
export async function labelRulesWithStats() {
  const [rules, stored, resolve] = await Promise.all([listLabelRules(), ingestionRowsTable.toArray(), ruleFieldResolver()])
  const rows = stored.map((row) => row.data as IngestionRow)
  return rules.map((rule) => ({ rule, stats: ruleStats(rule, rows, resolve) }))
}
