import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { Category, CategoryRule, TableKind } from './types'

export interface ResolvedCategory {
  /** What to show and group by. */
  label: string
  /** Row id of the Category matched, or null when the raw value stands for itself. */
  categoryId: number | null
}

function matches(rule: CategoryRule, raw: string): boolean {
  const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase()
  const value = rule.caseSensitive ? raw : raw.toLowerCase()
  switch (rule.match) {
    case 'equals':
      return value === pattern
    case 'contains':
      return value.includes(pattern)
    case 'startsWith':
      return value.startsWith(pattern)
    case 'regex':
      try {
        return new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i').test(raw)
      } catch {
        // A half-typed regex in the rules editor must not break every chart on screen.
        return false
      }
  }
}

/** Builds a first-match lookup using the same ordering as the resolver. */
export function createCategoryRuleMatcher(
  categories: StoredRow<Category>[],
  rules: StoredRow<CategoryRule>[],
  kind?: TableKind,
): (raw: unknown) => StoredRow<CategoryRule> | undefined {
  const categoryIds = new Set(categories.map((category) => category.id))
  const applicable = rules
    .filter((rule) => categoryIds.has(rule.categoryId) && (!rule.scope || !kind || rule.scope === kind))
    .slice()
    .sort((a, b) => a.priority - b.priority)
  return (raw) => {
    const value = typeof raw === 'string' ? raw.trim() : ''
    return applicable.find((rule) => matches(rule, value))
  }
}

/** Returns the first rule that owns a raw value, using the same ordering as the resolver. */
export function findMatchingCategoryRule(
  categories: StoredRow<Category>[],
  rules: StoredRow<CategoryRule>[],
  raw: unknown,
  kind?: TableKind,
): StoredRow<CategoryRule> | undefined {
  return createCategoryRuleMatcher(categories, rules, kind)(raw)
}

/**
 * Resolves raw values onto canonical categories.
 *
 * Rules run in `priority` order and the first match wins, so a broad rule ("contains
 * pix") can sit behind a narrow one ("contains pix devolvido") without swallowing it.
 *
 * A value matching no rule resolves to itself and stays visible in the category raw
 * values worklist. Categories are assigned only through their explicit match strings.
 *
 * The returned function memoises per raw string — a table of thousands of rows
 * typically holds a few dozen distinct raw values, so each one is matched against the
 * rules once. Build a new resolver when rules or categories change.
 */
export function createCategoryResolver(
  categories: StoredRow<Category>[],
  rules: StoredRow<CategoryRule>[],
  kind?: TableKind,
) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const applicable = rules
    .filter((rule) => !rule.scope || !kind || rule.scope === kind)
    .slice()
    .sort((a, b) => a.priority - b.priority)
  const cache = new Map<string, ResolvedCategory>()

  return function resolve(raw: unknown): ResolvedCategory {
    const value = typeof raw === 'string' ? raw.trim() : ''
    const hit = cache.get(value)
    if (hit) return hit

    let resolved: ResolvedCategory = { label: value, categoryId: null }
    for (const rule of applicable) {
      if (!matches(rule, value)) continue
      const category = byId.get(rule.categoryId)
      if (!category) continue // rule pointing at a deleted category — skip, don't crash
      resolved = { label: category.name, categoryId: rule.categoryId }
      break
    }

    cache.set(value, resolved)
    return resolved
  }
}
