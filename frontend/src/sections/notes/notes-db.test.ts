import { describe, expect, it } from 'vitest'
import { createLocalTable } from '@/lib/local-store/create-local-table'
import { notesTable } from './notes-db'
import type { NoteRecord } from './notes-store'

const notes = createLocalTable<NoteRecord>(notesTable)

describe('notes-db', () => {
  it('round-trips a note', async () => {
    const text = `note-${crypto.randomUUID()}`

    await notes.add({ text })
    const rows = await notes.list()

    expect(rows.some((n) => n.text === text)).toBe(true)
  })

  it('deletes a note by id', async () => {
    const text = `note-${crypto.randomUUID()}`
    const id = await notes.add({ text })

    await notes.remove(id)

    expect((await notes.list()).some((n) => n.text === text)).toBe(false)
  })
})
