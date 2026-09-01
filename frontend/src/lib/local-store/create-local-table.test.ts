import Dexie, { type EntityTable } from 'dexie'
import { describe, expect, it } from 'vitest'
import { createLocalTable, type LocalRow } from './create-local-table'

interface Fixture {
  a: number
  b: string
}

const db = new Dexie('test-local-table-db') as Dexie & { rows: EntityTable<LocalRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

const table = createLocalTable<Fixture>(db.rows)

describe('createLocalTable', () => {
  it('round-trips a record', async () => {
    const value = { a: 1, b: `b-${crypto.randomUUID()}` }

    await table.add(value)
    const rows = await table.list()

    expect(rows.some((r) => r.b === value.b && r.a === value.a)).toBe(true)
  })

  it('skips legacy rows left over from the encrypted schema', async () => {
    const marker = crypto.randomUUID()
    await table.add({ a: 1, b: marker })
    // A row as the pre-plaintext schema wrote it: no `data`, just the envelope fields.
    await db.rows.add({ createdAt: Date.now(), salt: 's', iv: 'i', ciphertext: 'c' } as unknown as LocalRow)

    const rows = await table.list()

    expect(rows.some((r) => r.b === marker)).toBe(true)
    expect(rows.every((r) => r.b !== undefined)).toBe(true)
  })

  it('deletes a record by id', async () => {
    const value = { a: 3, b: `b-${crypto.randomUUID()}` }
    const id = await table.add(value)

    await table.remove(id)

    expect((await table.list()).some((r) => r.b === value.b)).toBe(false)
  })

  it('updates a record in place, preserving its id and createdAt', async () => {
    const marker = crypto.randomUUID()
    const id = await table.add({ a: 1, b: `${marker}-original` })
    const original = (await table.list()).find((r) => r.id === id)

    await table.update(id, { a: 2, b: `${marker}-updated` })
    const updated = (await table.list()).find((r) => r.id === id)

    expect(updated?.b).toBe(`${marker}-updated`)
    expect(updated?.a).toBe(2)
    expect(updated?.createdAt).toBe(original!.createdAt)
  })

  it('removeMany deletes only the given ids', async () => {
    const marker = crypto.randomUUID()
    const ids = await table.bulkAdd([
      { a: 1, b: `${marker}-x` },
      { a: 2, b: `${marker}-y` },
      { a: 3, b: `${marker}-z` },
    ])

    await table.removeMany([ids[0], ids[1]])
    const remaining = (await table.list()).filter((r) => r.b.startsWith(marker))

    expect(remaining).toHaveLength(1)
    expect(remaining[0].b).toBe(`${marker}-z`)
  })

  it('bulkAdd round-trips multiple records', async () => {
    const marker = crypto.randomUUID()
    const ids = await table.bulkAdd([
      { a: 10, b: `${marker}-x` },
      { a: 20, b: `${marker}-y` },
      { a: 30, b: `${marker}-z` },
    ])
    expect(ids).toHaveLength(3)

    const found = (await table.list()).filter((r) => r.b.startsWith(marker))
    expect(found).toHaveLength(3)
    expect(found.map((r) => r.a).sort((x, y) => x - y)).toEqual([10, 20, 30])
  })
})
