import type { LocalRow } from '@/lib/local-store/create-local-table'
import { LOCALE_STORAGE_KEY } from '@/lib/locale'
import { METRIC_COLUMNS_STORAGE_KEY } from '@/lib/metric-columns'
import { THEME_STORAGE_KEY } from '@/store/theme-store'

/**
 * The preferences that live in localStorage, dressed as a table.
 *
 * Theme, language and which metric columns are hidden are settings a person expects to
 * travel with their data — an export that restores every row but opens in the wrong
 * language, or with a table they had narrowed showing all twenty-eight columns, has not
 * restored their setup. They cannot move into Dexie without the theme flashing on every load
 * (index.html reads the key before React exists), so instead they present the same
 * shape the export machinery already knows, and travel with everything else.
 */
const KEYS = [THEME_STORAGE_KEY, LOCALE_STORAGE_KEY, METRIC_COLUMNS_STORAGE_KEY] as const

export const preferencesTable = {
  async toArray(): Promise<LocalRow[]> {
    return KEYS.flatMap((key, index) => {
      const value = localStorage.getItem(key)
      return value === null ? [] : [{ id: index + 1, createdAt: 0, data: { key, value } }]
    })
  },

  async count(): Promise<number> {
    return (await preferencesTable.toArray()).length
  },

  // Clearing the data should not reset how the app looks or which language it speaks,
  // so this is deliberately a no-op; an import overwrites what it carries instead.
  async clear(): Promise<void> {},

  async bulkPut(rows: LocalRow[]): Promise<void> {
    for (const row of rows) {
      const { key, value } = (row.data ?? {}) as { key?: string; value?: string }
      if (typeof key === 'string' && typeof value === 'string' && (KEYS as readonly string[]).includes(key)) {
        localStorage.setItem(key, value)
      }
    }
  },
}
