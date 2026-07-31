import { describe, expect, it } from 'vitest'
import { addNote, deleteNote, listNotes } from './secure-db'

describe('secure-db', () => {
  it('round-trips a note through the correct passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const text = `note-${crypto.randomUUID()}`

    await addNote(passphrase, text)
    const notes = await listNotes(passphrase)

    expect(notes.some((n) => n?.text === text)).toBe(true)
  })

  it('fails closed (filters out, does not throw) with the wrong passphrase', async () => {
    const text = `note-${crypto.randomUUID()}`
    await addNote(`correct-${crypto.randomUUID()}`, text)

    const notes = await listNotes(`wrong-${crypto.randomUUID()}`)

    expect(notes.some((n) => n?.text === text)).toBe(false)
  })

  it('deletes a note by id', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const text = `note-${crypto.randomUUID()}`
    await addNote(passphrase, text)

    const before = await listNotes(passphrase)
    const added = before.find((n) => n?.text === text)
    expect(added).toBeTruthy()

    await deleteNote(added!.id)
    const after = await listNotes(passphrase)

    expect(after.some((n) => n?.text === text)).toBe(false)
  })
})
