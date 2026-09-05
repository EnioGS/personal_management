import { beforeEach, describe, expect, it } from 'vitest'
import { METRIC_COLUMNS_STORAGE_KEY, readHiddenColumns, writeHiddenColumns } from './metric-columns'
import { preferencesTable } from './preferences-table'

describe('which metric columns are put away', () => {
  beforeEach(() => localStorage.clear())

  it('comes back as it was left', () => {
    writeHiddenColumns(['cachedTokens', 'toolMs'])

    expect(readHiddenColumns()).toEqual(['cachedTokens', 'toolMs'])
  })

  it('shows everything when nothing was saved, or when what was saved is unreadable', () => {
    expect(readHiddenColumns()).toEqual([])

    localStorage.setItem(METRIC_COLUMNS_STORAGE_KEY, 'not json at all')
    expect(readHiddenColumns()).toEqual([])
  })

  it('travels in the export, and an import puts it back', async () => {
    writeHiddenColumns(['cost'])
    const exported = await preferencesTable.toArray()
    expect(exported.map((row) => (row.data as { key: string }).key)).toContain(METRIC_COLUMNS_STORAGE_KEY)

    localStorage.clear()
    await preferencesTable.bulkPut(exported)

    expect(readHiddenColumns()).toEqual(['cost'])
  })
})
