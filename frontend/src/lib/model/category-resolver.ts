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

/**
 * Resolves raw values onto canonical categories.
 *
 * Rules run in `priority` order and the first match wins, so a broad rule ("contains
 * pix") can sit behind a narrow one ("contains pix devolvido") without swallowing it.
 *
 * A value matching no rule but spelled exactly like a category (case-insensitively)
 * resolves to that category too — this is what lets typing a category name straight
 * into a table (see ensure-categories.ts, which registers it) count as "classified"
 * immediately, with no separate rule needed for the plainest case. Only a value that
 * matches neither a rule nor a category name resolves to *itself*, and stays visible in
 * the "unclassified" worklist instead of quietly disappearing into "Outros".
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
  const byLowerName = new Map(categories.map((c) => [c.name.toLowerCase(), c]))
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

    if (resolved.categoryId === null && value) {
      const exact = byLowerName.get(value.toLowerCase())
      if (exact) resolved = { label: exact.name, categoryId: exact.id }
    }

    cache.set(value, resolved)
    return resolved
  }
}
