import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import type { ChatMessage } from '@/store/chat-store'
import {
  UNTITLED,
  deleteConversation,
  listConversations,
  readConversation,
  renameConversation,
  saveConversation,
} from './conversations'

function message(content: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'user', content }
}

describe('chat history', () => {
  beforeEach(async () => { await wipeAllData() })

  it('is written as it happens, and rewritten in place as the conversation grows', async () => {
    const id = await saveConversation(null, { title: UNTITLED, messages: [message('hello')] })
    expect(id).not.toBeNull()

    const again = await saveConversation(id, { title: UNTITLED, messages: [message('hello'), message('and more')] })

    expect(again).toBe(id)
    expect(await listConversations()).toHaveLength(1)
    expect((await readConversation(id!))!.messages).toHaveLength(2)
  })

  it('never writes an empty conversation: opening the panel and closing it leaves nothing', async () => {
    expect(await saveConversation(null, { title: UNTITLED, messages: [] })).toBeNull()
    expect(await listConversations()).toEqual([])
  })

  it('lists what was last written to first, which is what a reload comes back to', async () => {
    const older = await saveConversation(null, { title: 'older', messages: [message('a')] })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const newer = await saveConversation(null, { title: 'newer', messages: [message('b')] })

    expect((await listConversations()).map((conversation) => conversation.id)).toEqual([newer, older])
  })

  it('takes a name, and falls back to untitled when given nothing', async () => {
    const id = await saveConversation(null, { title: UNTITLED, messages: [message('hello')] })
    await renameConversation(id!, '  Nubank import  ')
    expect((await readConversation(id!))!.title).toBe('Nubank import')

    await renameConversation(id!, '   ')
    expect((await readConversation(id!))!.title).toBe(UNTITLED)
  })

  it('is deleted permanently, since the list is the storage', async () => {
    const id = await saveConversation(null, { title: 'gone', messages: [message('hello')] })
    await deleteConversation(id!)

    expect(await listConversations()).toEqual([])
    expect(await readConversation(id!)).toBeUndefined()
  })

  it('is carried by an export, like everything else stored here', async () => {
    const { exportData } = await import('@/lib/data-file')
    await saveConversation(null, { title: 'kept', messages: [message('hello')] })

    const exported = await exportData()

    expect(exported.tables.conversations).toHaveLength(1)
    expect((exported.tables.conversations[0].data as { title: string }).title).toBe('kept')
  })
})
