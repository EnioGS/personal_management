import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { listClassificationNotes } from '@/lib/model/classification-notes'
import { addAgentMemoryTool, deleteAgentMemoryTool, editAgentMemoryTool, readAgentMemoryTool } from './memory-tools'

/** Said in full, because the tools require every field to say something. */
const SCOPE = {
  account: 'Nubank', card: 'global', section: 'finances', screen: 'spending',
  class: 'global', category: 'global', subcategory: 'global', lines: 'the 14 March rows',
}

async function remember(overrides: Record<string, unknown> = {}) {
  return JSON.parse(await addAgentMemoryTool.execute(
    { context: 'source', title: 'unlabelled — Nubank March', text: '14 rows: no merchant name.', ...SCOPE, ...overrides },
    { attachments: [], translate: (key: string) => key },
  ))
}

describe('the assistant writing to its own record', () => {
  beforeEach(async () => { await wipeAllData() })

  it('keeps it apart from the notes the user reads with the guide', async () => {
    await remember()

    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(1)
    expect(await listClassificationNotes()).toEqual([])
  })

  it('refuses an entry whose scope says nothing, a blank being no answer at all', async () => {
    const result = await addAgentMemoryTool.execute(
      { context: 'source', title: 't', text: 'something', ...SCOPE, account: '' },
      { attachments: [], translate: (key: string) => key },
    )

    expect(result).toContain('account')
    expect(await listClassificationNotes(undefined, 'memory')).toEqual([])
  })

  it('reads back everything it wrote, whatever stage each entry came up in', async () => {
    await remember()
    await remember({ context: 'confirmed', title: 'later', lines: 'the 3 April rows' })

    // The stage split belongs to the user's notes, which are sent per stage. Splitting the
    // assistant's own record hid an entry from the table it was needed at, and an empty
    // memory is answered by writing the entry again.
    const entries = JSON.parse(await readAgentMemoryTool.execute({}, { attachments: [], translate: (key: string) => key }))
    expect(entries.map((entry: { title: string }) => entry.title)).toEqual(['unlabelled — Nubank March', 'later'])
  })

  it('refuses a second entry covering exactly the scope of one that exists, naming it', async () => {
    const { memoryId } = await remember()

    const result = await addAgentMemoryTool.execute(
      { context: 'confirmed', title: 'a different heading', text: 'more about the same rows', ...SCOPE },
      { attachments: [], translate: (key: string) => key },
    )

    // One entry per scope: the scope is what organises the memory, so a second entry about
    // the same rows is the same fact stored twice, correctable in neither place.
    expect(result).toContain(`entry ${memoryId}`)
    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(1)
  })

  it('takes a second entry once the scope narrows to something else', async () => {
    await remember()

    await remember({ title: 'unlabelled — Nubank April', lines: 'the 3 April rows' })

    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(2)
  })

  it('refuses a second entry under a title already in use, naming the one to rewrite', async () => {
    const { memoryId } = await remember()

    const result = await addAgentMemoryTool.execute(
      { context: 'confirmed', title: 'unlabelled — Nubank March', text: 'the same thing again', ...SCOPE, lines: 'some other rows' },
      { attachments: [], translate: (key: string) => key },
    )

    expect(result).toContain(`entry ${memoryId}`)
    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(1)
  })

  it('shrinks an entry by rewriting it, which is what happens as the user explains rows', async () => {
    const { memoryId } = await remember()

    await editAgentMemoryTool.execute({ memoryId, text: '3 rows left: no merchant name.' }, { attachments: [], translate: (key: string) => key })

    const entries = await listClassificationNotes(undefined, 'memory')
    expect(entries[0].text).toBe('3 rows left: no merchant name.')
    // The scope was not restated, so it stays what it was rather than being cleared.
    expect(entries[0].scope?.account).toBe('Nubank')
  })

  it('will not remove an entry until it has been said what the entry holds', async () => {
    const { memoryId } = await remember()

    expect(await deleteAgentMemoryTool.execute({ memoryId }, { attachments: [], translate: (key: string) => key })).toContain('confirmed: true')
    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(1)

    await deleteAgentMemoryTool.execute({ memoryId, confirmed: true }, { attachments: [], translate: (key: string) => key })
    expect(await listClassificationNotes(undefined, 'memory')).toEqual([])
  })
})
