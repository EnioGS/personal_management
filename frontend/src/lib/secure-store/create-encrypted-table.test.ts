import Dexie, { type EntityTable } from 'dexie'
import { describe, expect, it } from 'vitest'
import { createEncryptedTable, type EncryptedRow } from './create-encrypted-table'

interface Fixture {
  a: number
  b: string
}

const db = new Dexie('test-encrypted-table-db') as Dexie & { rows: EntityTable<EncryptedRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

const table = createEncryptedTable<Fixture>(db.rows)

describe('createEncryptedTable', () => {
  it('round-trips a record through the correct passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const value = { a: 1, b: `b-${crypto.randomUUID()}` }

    await table.add(passphrase, value)
    const rows = await table.list(passphrase)

    expect(rows.some((r) => r?.b === value.b && r.a === value.a)).toBe(true)
  })

  it('fails closed (filters out, does not throw) with the wrong passphrase', async () => {
    const value = { a: 2, b: `b-${crypto.randomUUID()}` }
    await table.add(`correct-${crypto.randomUUID()}`, value)

    const rows = await table.list(`wrong-${crypto.randomUUID()}`)

    expect(rows.some((r) => r?.b === value.b)).toBe(false)
  })

  it('deletes a record by id', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const value = { a: 3, b: `b-${crypto.randomUUID()}` }
    await table.add(passphrase, value)

    const before = await table.list(passphrase)
    const added = before.find((r) => r?.b === value.b)
    expect(added).toBeTruthy()

    await table.remove(added!.id)
    const after = await table.list(passphrase)

    expect(after.some((r) => r?.b === value.b)).toBe(false)
  })

  it('bulkAdd round-trips multiple records', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const marker = crypto.randomUUID()
    const values = [
      { a: 10, b: `${marker}-x` },
      { a: 20, b: `${marker}-y` },
      { a: 30, b: `${marker}-z` },
    ]

    const ids = await table.bulkAdd(passphrase, values)
    expect(ids).toHaveLength(3)

    const rows = await table.list(passphrase)
    const found = rows.filter((r) => r?.b.startsWith(marker))
    expect(found).toHaveLength(3)
    expect(found.map((r) => r?.a).sort()).toEqual([10, 20, 30])
  })
})
