import { describe, expect, it } from 'vitest'
import { createEncryptedTable } from '@/lib/secure-store/create-encrypted-table'
import { notesTable } from './secure-db'
import type { NoteRecord } from './notes-store'

const notes = createEncryptedTable<NoteRecord>(notesTable)

describe('secure-db', () => {
  it('round-trips a note through the correct passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const text = `note-${crypto.randomUUID()}`

    await notes.add(passphrase, { text })
    const rows = await notes.list(passphrase)

    expect(rows.some((n) => n?.text === text)).toBe(true)
  })

  it('fails closed (filters out, does not throw) with the wrong passphrase', async () => {
    const text = `note-${crypto.randomUUID()}`
    await notes.add(`correct-${crypto.randomUUID()}`, { text })

    const rows = await notes.list(`wrong-${crypto.randomUUID()}`)

    expect(rows.some((n) => n?.text === text)).toBe(false)
  })

  it('deletes a note by id', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const text = `note-${crypto.randomUUID()}`
    await notes.add(passphrase, { text })

    const before = await notes.list(passphrase)
    const added = before.find((n) => n?.text === text)
    expect(added).toBeTruthy()

    await notes.remove(added!.id)
    const after = await notes.list(passphrase)

    expect(after.some((n) => n?.text === text)).toBe(false)
  })
})
