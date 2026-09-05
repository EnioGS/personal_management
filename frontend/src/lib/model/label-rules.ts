import { comparableText } from './row-query'
import type { IngestionRowLabels, LabelRule } from './types'

export type StoredRule = LabelRule & { id: number }

/** The labels a rule can set. Placement first, meaning second. */
const LABEL_KEYS: (keyof IngestionRowLabels)[] = ['sections', 'screens', 'category', 'subcategory', 'account', 'card']

/**
 * Whether one condition holds.
 *
 * Substring is the default because most merchants are distinctive. A short name is not:
 * "of" is inside Microsoft, so `equals` and `startsWith` exist, and `regex` for the cases
 * where a bank writes the same thing five ways.
 */
export function conditionHolds(condition: Pick<LabelRule, 'contains' | 'caseSensitive' | 'match'>, text: unknown): boolean {
  const needle = condition.contains?.trim()
  if (!needle) return false
  if (condition.match === 'regex') {
    try {
      return new RegExp(needle, condition.caseSensitive ? '' : 'i').test(String(text ?? ''))
    } catch {
      // An unusable pattern matches nothing rather than throwing mid-import; saving one
      // is refused earlier, where the user can see why.
      return false
    }
  }
  const value = comparableText(text, condition.caseSensitive)
  const wanted = comparableText(needle, condition.caseSensitive)
  if (condition.match === 'equals') return value === wanted
  if (condition.match === 'startsWith') return value.startsWith(wanted)
  return value.includes(wanted)
}

/** Whether a rule applies: its own condition, and every further one. All must hold. */
export function ruleApplies(rule: LabelRule, resolveField: (field: string) => unknown): boolean {
  if (!conditionHolds(rule, resolveField(rule.field || 'description'))) return false
  return (rule.where ?? []).every((condition) => conditionHolds(condition, resolveField(condition.field || 'description')))
}

export interface RuleApplication {
  labels: IngestionRowLabels
  appliedRuleIds: number[]
  filled: { ruleId: number; fields: string[] }[]
}

/**
 * Applies standing rules to one row's labels.
 *
 * A rule fills only what is not there yet — a judgement made by hand or by the assistant
 * outranks a standing rule — and two rules matching the same row compose rather than
 * fight. Category and subcategory count as filled once they hold anything but their
 * default, so a rule may sharpen `outros` but never overwrite a real answer.
 */
export function applyLabelRules(labels: IngestionRowLabels, rules: StoredRule[], resolveField: (field: string) => unknown, defaultMeaning = 'outros'): RuleApplication {
  const next: IngestionRowLabels = { ...labels }
  const appliedRuleIds: number[] = []
  const filled: RuleApplication['filled'] = []

  const isEmpty = (key: keyof IngestionRowLabels) => {
    const held = next[key]
    if (Array.isArray(held)) return held.length === 0
    if (typeof held === 'string') return held.trim() === '' || held.trim() === defaultMeaning
    return held === undefined
  }

  for (const rule of rules) {
    if (!ruleApplies(rule, resolveField)) continue
    const fields: string[] = []
    for (const key of LABEL_KEYS) {
      const value = rule.labels[key]
      if (value === undefined || !isEmpty(key)) continue
      Object.assign(next, { [key]: value })
      fields.push(key)
    }
    if (fields.length === 0) continue
    filled.push({ ruleId: rule.id, fields })
    if (!appliedRuleIds.includes(rule.id)) appliedRuleIds.push(rule.id)
  }

  return { labels: next, appliedRuleIds, filled }
}

export interface RuleStats {
  applied: number
  confirmedRespected: number
  overridden: number
  pending: number
  matchedStrings: string[]
}

export interface RuleSubject {
  labels: IngestionRowLabels
  appliedRuleIds?: number[]
  confirmed: boolean
  text: (field: string) => unknown
}

/**
 * What a rule can honestly claim: rows it filled, and of those, the ones confirmed with
 * its labels still intact. Counted from the rows every time rather than kept as a tally,
 * so it cannot drift from the truth.
 */
export function ruleStats(rule: StoredRule, subjects: RuleSubject[]): RuleStats {
  const stats: RuleStats = { applied: 0, confirmedRespected: 0, overridden: 0, pending: 0, matchedStrings: [] }
  const strings = new Set<string>()

  for (const subject of subjects) {
    const claimed = subject.appliedRuleIds?.includes(rule.id)
    const matches = ruleApplies(rule, subject.text)
    if (!claimed && !matches) continue
    stats.applied += 1
    const text = String(subject.text(rule.field || 'description') ?? '').trim()
    if (text) strings.add(text)

    const holds = LABEL_KEYS.every((key) => {
      const value = rule.labels[key]
      if (value === undefined) return true
      const held = subject.labels[key]
      return Array.isArray(value) ? Array.isArray(held) && value.every((entry) => held.includes(entry)) : held === value
    })
    if (!subject.confirmed) stats.pending += 1
    else if (holds) stats.confirmedRespected += 1
    else stats.overridden += 1
  }

  stats.matchedStrings = [...strings].sort((left, right) => left.localeCompare(right))
  return stats
}
