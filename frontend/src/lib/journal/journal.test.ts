import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { JOURNALLED_TABLES, confirmedRowsTable } from '@/lib/model/model-db'
import { journalEntriesTable } from './journal-db'
import { beginTurn, endTurn, listTurns, readJournal, undoTurn, withoutJournal } from './journal'

const row = (category: string) => ({ rowId: 'r1', section: 'finances', screen: 'movements', confirmedAt: 1, observations: '{}', category, subcategory: '' })

beforeEach(async () => {
  await wipeAllData()
  await journalEntriesTable.clear()
})

describe('what a write leaves behind', () => {
  it('remembers an insert with nothing before it', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })

    const [entry] = await readJournal()
    expect(entry).toMatchObject({ table: 'confirmedRows', rowId: id, op: 'insert', before: null })
    expect((entry.after as { data: { category: string } }).data.category).toBe('mercado')
  })

  it('remembers an update as the row it was and the row it became', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    await confirmedRowsTable.update(id, { data: row('farmácia') })

    const [entry] = await readJournal()
    expect(entry.op).toBe('update')
    expect((entry.before as { data: { category: string } }).data.category).toBe('mercado')
    expect((entry.after as { data: { category: string } }).data.category).toBe('farmácia')
  })

  it('remembers a delete, which is the only record of it there is', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    await confirmedRowsTable.delete(id)

    const [entry] = await readJournal()
    expect(entry).toMatchObject({ op: 'delete', after: null })
    expect((entry.before as { data: { category: string } }).data.category).toBe('mercado')
  })

  it('records nothing while it is paused, which is what an import needs', async () => {
    await withoutJournal(async () => { await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') }) })

    expect(await readJournal()).toEqual([])
  })
})

describe('a turn', () => {
  it('gathers everything one message did, and counts it by table and operation', async () => {
    beginTurn({ origin: 'assistant', label: 'labelling', statement: 'UPDATE confirmed_rows SET category = ?' })
    const first = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    await confirmedRowsTable.add({ createdAt: 1, data: row('farmácia') })
    await confirmedRowsTable.update(first, { data: row('padaria') })
    endTurn()

    const [turn] = await listTurns()
    expect(turn).toMatchObject({ origin: 'assistant', label: 'labelling', entries: 3 })
    expect(turn.counts.confirmedRows).toEqual({ insert: 2, update: 1, delete: 0 })
  })

  it('reads a burst of writes with no turn open as the one action it was', async () => {
    // Deleting a source table is one act and several Dexie calls; a person undoing it
    // means the act, not the third call inside it.
    await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    await confirmedRowsTable.add({ createdAt: 1, data: row('farmácia') })

    const turns = await listTurns()
    expect(turns).toHaveLength(1)
    expect(turns[0].counts.confirmedRows).toMatchObject({ insert: 2 })
  })

  it('gives each thing a message did a turn of its own, inside the message', async () => {
    const message = beginTurn({ origin: 'assistant', label: 'the whole request' })
    const statement = beginTurn({ origin: 'sql', statement: 'UPDATE confirmed_rows SET class = ?' })
    await confirmedRowsTable.add({ createdAt: 1, data: row('by sql') })
    endTurn()
    await confirmedRowsTable.add({ createdAt: 1, data: row('by a tool') })
    endTurn()

    const turns = await listTurns()
    // The statement is undoable on its own, and says which message it belonged to.
    const inner = turns.find((turn) => turn.turnId === statement)
    expect(inner).toMatchObject({ origin: 'sql', parentId: message })
    expect(inner!.statement).toContain('UPDATE')
    expect(turns.find((turn) => turn.turnId === message)?.origin).toBe('assistant')
  })
})

describe('undoing a turn', () => {
  it('puts back what was deleted and removes what was added', async () => {
    const kept = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })

    const turnId = beginTurn({ origin: 'assistant' })
    await confirmedRowsTable.delete(kept)
    await confirmedRowsTable.add({ createdAt: 1, data: row('invented') })
    endTurn()
    expect(await confirmedRowsTable.count()).toBe(1)

    const result = await undoTurn(turnId, JOURNALLED_TABLES as never)

    expect(result.restored).toBe(2)
    const rows = (await confirmedRowsTable.toArray()).map((stored) => (stored.data as { category: string }).category)
    expect(rows).toEqual(['mercado'])
  })

  it('restores a row to what it was before the turn changed it', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })

    const turnId = beginTurn({ origin: 'assistant' })
    await confirmedRowsTable.update(id, { data: row('wrong') })
    endTurn()

    await undoTurn(turnId, JOURNALLED_TABLES as never)

    expect(((await confirmedRowsTable.get(id))!.data as { category: string }).category).toBe('mercado')
  })

  it('refuses a row somebody has touched since, rather than losing their work too', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    const turnId = beginTurn({ origin: 'assistant' })
    await confirmedRowsTable.update(id, { data: row('wrong') })
    endTurn()

    await confirmedRowsTable.update(id, { data: row('fixed by hand') })
    const result = await undoTurn(turnId, JOURNALLED_TABLES as never)

    expect(result.restored).toBe(0)
    expect(result.skipped[0]).toContain('changed since')
    expect(((await confirmedRowsTable.get(id))!.data as { category: string }).category).toBe('fixed by hand')
  })

  it('is itself a turn, so undoing the wrong one is not the end of it', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: row('mercado') })
    const turnId = beginTurn({ origin: 'assistant' })
    await confirmedRowsTable.update(id, { data: row('wrong') })
    endTurn()

    await undoTurn(turnId, JOURNALLED_TABLES as never)

    const turns = await listTurns()
    expect(turns[0].origin).toBe('system')
    expect(turns[0].label).toContain('Undo of')
  })

  it('says so when there is no record of the turn', async () => {
    await expect(undoTurn('nothing', JOURNALLED_TABLES as never)).rejects.toThrow(/no record/)
  })
})
