import { describe, expect, it } from 'vitest'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { labelCoverage } from './label-coverage'
import type { Entry, EntryLabels } from './types'

describe('label coverage', () => {
  it('ignores deleted entries and reports active history awaiting review', () => {
    const entries: StoredRow<Entry>[] = [
      { id: 1, createdAt: 1, tableId: 1 },
      { id: 2, createdAt: 1, tableId: 1, deleted: true },
      { id: 3, createdAt: 1, tableId: 1 },
    ]
    const labels: StoredRow<EntryLabels>[] = [
      { id: 1, createdAt: 1, entryId: 1, financeDestinations: ['movements'], flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'unknown' },
      { id: 2, createdAt: 1, entryId: 2, financeDestinations: ['movements'], flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'unknown' },
    ]
    expect(labelCoverage(entries, labels)).toEqual({ activeEntries: 2, labelledEntries: 1, awaitingReview: 1, orphanedLabels: 1 })
  })
})
