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

  it('reads back what it wrote, filtered by the stage it belongs to', async () => {
    await remember()
    await remember({ context: 'confirmed', title: 'later' })

    const source = JSON.parse(await readAgentMemoryTool.execute({ context: 'source' }, { attachments: [], translate: (key: string) => key }))
    expect(source.map((entry: { title: string }) => entry.title)).toEqual(['unlabelled — Nubank March'])
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
