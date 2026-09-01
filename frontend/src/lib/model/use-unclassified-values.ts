import { useMemo } from 'react'
import { createCategoryResolver } from './category-resolver'
import { categoryColumnFor } from './table-kinds'
import { useCategoriesStore, useCategoryRulesStore, useEntriesStore, useTableDefsStore } from './model-stores'

export interface UnclassifiedValue {
  value: string
  /** How many entries currently carry this exact raw value, across every table. */
  count: number
}

/**
 * Raw category-column values no rule currently resolves, most-used first — the
 * worklist behind Settings -> Categorias' "promote or assign" flow.
 *
 * Each table is resolved against its own kind's rules (a rule's `scope` only applies
 * to matching kinds), so a value already handled in one kind but not another still
 * surfaces here for the kind where it needs a rule.
 */
export function useUnclassifiedValues(): UnclassifiedValue[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const categories = useCategoriesStore((s) => s.items)
  const rules = useCategoryRulesStore((s) => s.items)

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const table of tableDefs) {
      const column = categoryColumnFor(table.kind)
      if (!column) continue

      const resolve = createCategoryResolver(categories, rules, table.kind)
      for (const entry of entries) {
        if (entry.tableId !== table.id || entry.deleted) continue
        const raw = entry[column]
        if (typeof raw !== 'string' || !raw.trim()) continue
        if (resolve(raw).categoryId !== null) continue
        counts.set(raw, (counts.get(raw) ?? 0) + 1)
      }
    }

    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [tableDefs, entries, categories, rules])
}
