import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import {
  addClassificationNote,
  classificationNotesForPrompt,
  deleteClassificationNote,
  editClassificationNote,
  listClassificationNotes,
} from './classification-notes'

describe('notes on how to classify', () => {
  beforeEach(async () => { await wipeAllData() })

  it('belong to a stage and are listed oldest first, as things established over time', async () => {
    await addClassificationNote({ context: 'confirmed', text: 'Charme is a market — groceries, not leisure.', createdBy: 'user' })
    await addClassificationNote({ context: 'source', text: 'The broker file writes sells as positive.', createdBy: 'assistant' })

    expect((await listClassificationNotes('confirmed')).map((note) => note.createdBy)).toEqual(['user'])
    expect((await listClassificationNotes()).map((note) => note.context)).toEqual(['confirmed', 'source'])
  })

  it('refuses a note with nothing in it', async () => {
    await expect(addClassificationNote({ context: 'source', text: '   ', createdBy: 'user' })).rejects.toThrow(/needs something/)
  })

  it('reaches the assistant grouped by stage, saying who wrote each', async () => {
    await addClassificationNote({ context: 'confirmed', text: 'Charme is a market.', createdBy: 'user' })

    const rendered = await classificationNotesForPrompt()

    expect(rendered).toContain('## Notes on this data')
    expect(rendered).toContain('About rows already confirmed:')
    expect(rendered).toContain('- Charme is a market. _(user)_')
  })

  it('says nothing at all when nothing is written down', async () => {
    expect(await classificationNotesForPrompt()).toBe('')
  })

  it('can be withdrawn', async () => {
    const id = await addClassificationNote({ context: 'source', text: 'Temporary.', createdBy: 'user' })
    await deleteClassificationNote(id)

    expect(await listClassificationNotes()).toEqual([])
  })
})

describe('redrafting a note', () => {
  beforeEach(async () => { await wipeAllData() })

  it('replaces the text and records who went over it, keeping its place in the list', async () => {
    const first = await addClassificationNote({ context: 'source', text: 'Written first.', createdBy: 'user' })
    await addClassificationNote({ context: 'source', text: 'Written second.', createdBy: 'assistant' })

    await editClassificationNote(first, '  Charme is a market — groceries.  ', 'assistant')

    const notes = await listClassificationNotes('source')
    expect(notes.map((note) => note.text)).toEqual(['Charme is a market — groceries.', 'Written second.'])
    expect(notes[0]).toMatchObject({ createdBy: 'user', editedBy: 'assistant' })
    expect(notes[0].editedAt).toBeGreaterThan(0)
  })

  it('refuses to empty a note, which is what deleting is for', async () => {
    const id = await addClassificationNote({ context: 'confirmed', text: 'Something.', createdBy: 'user' })

    await expect(editClassificationNote(id, '   ', 'user')).rejects.toThrow(/needs something/)
    expect((await listClassificationNotes())[0].text).toBe('Something.')
  })

  it('says so when there is no such note', async () => {
    await expect(editClassificationNote(999, 'anything', 'user')).rejects.toThrow(/was not found/)
  })
})
