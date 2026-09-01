import { beforeEach, describe, expect, it } from 'vitest'
import { spendingTable } from '@/sections/finances/spending-db'
import { migrateLegacyData } from './migrate-legacy-db'
import { entriesTable, tableDefsTable } from './model-db'

const MIGRATED_KEY = 'pm.legacyMigratedAt'

async function resetAll() {
  localStorage.removeItem(MIGRATED_KEY)
  await spendingTable.clear()
  await tableDefsTable.clear()
  await entriesTable.clear()
}

describe('migrateLegacyData', () => {
  beforeEach(resetAll)

  it('folds pre-existing rows into the model', async () => {
    await spendingTable.add({ createdAt: 1, data: { date: 1, category: 'Alimentação', amount: 5 } })

    await migrateLegacyData()

    expect(await tableDefsTable.count()).toBe(1)
    expect(await entriesTable.count()).toBe(1)
  })

  it('tags migrated entries with the new table id', async () => {
    await spendingTable.add({ createdAt: 1, data: { date: 1, category: 'Alimentação', amount: 5 } })

    await migrateLegacyData()

    const [def] = await tableDefsTable.toArray()
    const [entry] = await entriesTable.toArray()
    expect((entry.data as { tableId: number }).tableId).toBe(def.id)
  })

  it('runs once — a second call does not duplicate anything', async () => {
    await spendingTable.add({ createdAt: 1, data: { date: 1, category: 'Alimentação', amount: 5 } })

    await migrateLegacyData()
    await migrateLegacyData()

    expect(await tableDefsTable.count()).toBe(1)
    expect(await entriesTable.count()).toBe(1)
  })

  it('leaves the legacy rows in place, so a bad upgrade costs nothing', async () => {
    await spendingTable.add({ createdAt: 1, data: { date: 1, category: 'Alimentação', amount: 5 } })

    await migrateLegacyData()

    expect(await spendingTable.count()).toBe(1)
  })

  it('does nothing on a fresh install, and still marks itself done', async () => {
    await migrateLegacyData()

    expect(await tableDefsTable.count()).toBe(0)
    expect(localStorage.getItem(MIGRATED_KEY)).not.toBeNull()
  })

  it('refuses to migrate on top of an existing model', async () => {
    await spendingTable.add({ createdAt: 1, data: { date: 1, category: 'Alimentação', amount: 5 } })
    // Stands in for a user who already created their own table, or just imported a file.
    await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'cardLedger' } })

    await migrateLegacyData()

    expect(await tableDefsTable.count()).toBe(1)
    expect(await entriesTable.count()).toBe(0)
  })
})
