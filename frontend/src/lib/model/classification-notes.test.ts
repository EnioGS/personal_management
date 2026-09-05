import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import {
  addClassificationNote,
  classificationNotesForPrompt,
  deleteClassificationNote,
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
