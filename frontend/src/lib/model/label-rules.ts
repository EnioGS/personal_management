import { comparableText } from './row-query'
import type { IngestionRow, IngestionRowLabels, LabelRule } from './types'

export type StoredRule = LabelRule & { id: number }

/** The label dimensions a rule can set. Destination table is handled separately. */
const LABEL_KEYS: (keyof IngestionRowLabels)[] = ['sections', 'subsections', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence']

export function ruleMatchesText(rule: Pick<LabelRule, 'contains' | 'caseSensitive' | 'match'>, text: unknown): boolean {
  const needle = comparableText(rule.contains, rule.caseSensitive)
  if (!needle) return false
  const value = comparableText(text, rule.caseSensitive)
  if (rule.match === 'equals') return value === needle
  if (rule.match === 'startsWith') return value.startsWith(needle)
  return value.includes(needle)
}

/**
 * Whether a rule applies to a row: its own text condition, and every further one.
 * All must hold — a rule narrowed by where it came from should not fire on a file it
 * was never meant for.
 */
export function ruleMatchesRow(rule: LabelRule, row: IngestionRow, resolveField: (row: IngestionRow, field: string) => unknown): boolean {
  if (!ruleMatchesText(rule, resolveField(row, rule.field || 'description'))) return false
  return (rule.where ?? []).every((condition) => ruleMatchesText(condition, resolveField(row, condition.field || 'description')))
}

export interface RuleApplication {
  labels: IngestionRowLabels
  destinationTableId?: number
  appliedRuleIds: number[]
  /** What each rule actually filled, for reporting back. */
  filled: { ruleId: number; fields: string[] }[]
}

/**
 * Applies standing rules to one row.
 *
 * A rule fills only what the row does not already have. A judgement made by hand or
 * by the assistant outranks a standing rule, and two rules matching the same row
 * compose rather than fight: the first to match a field owns it, the next fills what
 * is still empty. Nothing is overwritten, so applying rules again is harmless.
 */
export function applyLabelRules(row: IngestionRow, rules: StoredRule[], resolveField: (row: IngestionRow, field: string) => unknown): RuleApplication {
  const labels: IngestionRowLabels = { ...row.labels }
  let destinationTableId = row.destinationTableId
  const appliedRuleIds = [...(row.appliedRuleIds ?? [])]
  const filled: RuleApplication['filled'] = []

  for (const rule of rules) {
    if (!ruleMatchesRow(rule, row, resolveField)) continue
    const fields: string[] = []
    for (const key of LABEL_KEYS) {
      const value = rule.labels[key]
      const held = labels[key]
      if (value === undefined || (Array.isArray(held) ? held.length > 0 : held !== undefined)) continue
      Object.assign(labels, { [key]: value })
      fields.push(key)
    }
    if (rule.destinationTableId !== undefined && destinationTableId === undefined) {
      destinationTableId = rule.destinationTableId
      fields.push('destinationTableId')
    }
    if (fields.length === 0) continue
    filled.push({ ruleId: rule.id, fields })
    if (!appliedRuleIds.includes(rule.id)) appliedRuleIds.push(rule.id)
  }

  return { labels, destinationTableId, appliedRuleIds, filled }
}

export interface RuleStats {
  /** Rows the rule filled something on and that still exist. */
  applied: number
  /** Rows the user confirmed with every label this rule set still intact. */
  confirmedRespected: number
  /** Confirmed rows where one of the rule's own labels was changed before confirmation. */
  overridden: number
  /** Rows still waiting, carrying this rule's labels. */
  pending: number
  /** The distinct source texts this rule actually matched. */
  matchedStrings: string[]
}

function ruleStillHolds(rule: LabelRule, row: IngestionRow): boolean {
  for (const key of LABEL_KEYS) {
    const value = rule.labels[key]
    if (value === undefined) continue
    const held = row.labels[key]
    // A multi-valued label still holds as long as everything the rule set is there.
    if (Array.isArray(value)) {
      if (!Array.isArray(held) || !value.every((entry) => held.includes(entry))) return false
    } else if (held !== value) return false
  }
  return rule.destinationTableId === undefined || row.destinationTableId === rule.destinationTableId
}

/**
 * What a rule can honestly claim.
 *
 * A row counts for a rule only when the user confirmed it *and* every label the rule
 * set still holds the value the rule gave it. Labels the rule never set are free to be
 * filled in by hand — the rule claims what it decided, not the whole row. Counted from
 * the rows every time rather than kept as a tally, so it cannot drift from the truth.
 */
export function ruleStats(rule: StoredRule, rows: IngestionRow[], resolveField: (row: IngestionRow, field: string) => unknown): RuleStats {
  const stats: RuleStats = { applied: 0, confirmedRespected: 0, overridden: 0, pending: 0, matchedStrings: [] }
  const strings = new Set<string>()

  for (const row of rows) {
    if (!row.appliedRuleIds?.includes(rule.id)) continue
    stats.applied += 1
    const text = String(resolveField(row, rule.field || 'description') ?? '').trim()
    if (text) strings.add(text)
    const confirmed = row.status === 'promoted' || row.status === 'reconciledExisting'
    if (!confirmed) stats.pending += 1
    else if (ruleStillHolds(rule, row)) stats.confirmedRespected += 1
    else stats.overridden += 1
  }

  stats.matchedStrings = [...strings].sort((left, right) => left.localeCompare(right))
  return stats
}
