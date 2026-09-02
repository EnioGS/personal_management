import { useMemo } from 'react'
import { createCategoryRuleMatcher } from './category-resolver'
import { categoryColumnFor } from './table-kinds'
import { useCategoriesStore, useCategoryRulesStore, useEntriesStore, useTableDefsStore } from './model-stores'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { Category, CategoryRule, Entry, TableDef } from './types'

export interface CategoryRawValue {
  value: string
  /** How many entries currently carry this exact raw value, across every table. */
  count: number
  /** The first matching string for each table kind where this value is classified. */
  matchingStrings: string[]
  /** Category names receiving this value through those matching strings. */
  matchedCategories: string[]
  /** True when at least one occurrence of this value is not covered by a rule/category. */
  unmatched: boolean
}

interface CategoryRawValuesInput {
  tableDefs: StoredRow<TableDef>[]
  entries: StoredRow<Entry>[]
  categories: StoredRow<Category>[]
  rules: StoredRow<CategoryRule>[]
}

/** Pure collector shared by the Settings UI and the assistant's read-only tool. */
export function collectCategoryRawValues({ tableDefs, entries, categories, rules }: CategoryRawValuesInput): CategoryRawValue[] {
  const values = new Map<string, CategoryRawValue>()

  for (const table of tableDefs) {
    const column = categoryColumnFor(table.kind)
    if (!column) continue

    const findMatchingRule = createCategoryRuleMatcher(categories, rules, table.kind)
    for (const entry of entries) {
      if (entry.tableId !== table.id || entry.deleted) continue
      const raw = entry[column]
      if (typeof raw !== 'string' || !raw.trim()) continue
      const matchingRule = findMatchingRule(raw)
      const current = values.get(raw) ?? {
        value: raw,
        count: 0,
        matchingStrings: [],
        matchedCategories: [],
        unmatched: false,
      }
      current.count += 1
      if (matchingRule) {
        if (!current.matchingStrings.includes(matchingRule.pattern)) current.matchingStrings.push(matchingRule.pattern)
        const category = categories.find((item) => item.id === matchingRule.categoryId)
        if (category && !current.matchedCategories.includes(category.name)) current.matchedCategories.push(category.name)
      } else current.unmatched = true
      values.set(raw, current)
    }
  }

  return [...values.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/**
 * Raw category-column values, most-used first — the worklist behind Settings ->
 * Categories. Each value reports the matching string that currently owns it.
 *
 * Each table is resolved against its own kind's rules (a rule's `scope` only applies
 * to matching kinds), so a value already handled in one kind but not another still
 * surfaces here for the kind where it needs a rule.
 */
export function useCategoryRawValues(): CategoryRawValue[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const categories = useCategoriesStore((s) => s.items)
  const rules = useCategoryRulesStore((s) => s.items)

  return useMemo(() => collectCategoryRawValues({ tableDefs, entries, categories, rules }), [tableDefs, entries, categories, rules])
}

/** @deprecated Prefer useCategoryRawValues; retained for callers outside the settings screen. */
export function useUnclassifiedValues(): CategoryRawValue[] {
  return useCategoryRawValues().filter((item) => item.unmatched)
}
