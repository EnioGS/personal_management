import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { Entry, EntryLabels } from './types'

export interface LabelCoverage {
  activeEntries: number
  labelledEntries: number
  awaitingReview: number
  orphanedLabels: number
}

/** Safety gate for retiring category-rule fallback: only active entries count. */
export function labelCoverage(entries: StoredRow<Entry>[], labels: StoredRow<EntryLabels>[]): LabelCoverage {
  const active = entries.filter((entry) => !entry.deleted)
  const activeIds = new Set(active.map((entry) => entry.id))
  const labelled = new Set(labels.map((label) => label.entryId).filter((id) => activeIds.has(id)))
  return {
    activeEntries: active.length,
    labelledEntries: labelled.size,
    awaitingReview: active.length - labelled.size,
    orphanedLabels: labels.filter((label) => !activeIds.has(label.entryId)).length,
  }
}
