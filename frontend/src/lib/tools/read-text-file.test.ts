import { describe, expect, it } from 'vitest'
import type { ChatAttachment } from '@/lib/chat-attachments'
import { readTextFileTool } from './read-text-file'

function makeContext(attachments: ChatAttachment[] = []) {
  return { attachments }
}

describe('readTextFileTool', () => {
  it('returns the content of a found attachment', async () => {
    const attachment: ChatAttachment = { id: 'abc', name: 'notes.txt', type: 'text/plain', content: 'hello' }
    const result = await readTextFileTool.execute({ fileId: 'abc' }, makeContext([attachment]))
    expect(result).toBe('hello')
  })

  it('returns an error string (not a throw) for an unknown fileId', async () => {
    const result = await readTextFileTool.execute({ fileId: 'missing' }, makeContext())
    expect(result).toContain('no attached file')
    expect(result).toContain('missing')
  })

  it('returns an error string (not a throw) when fileId is missing', async () => {
    const result = await readTextFileTool.execute({}, makeContext())
    expect(result).toContain('fileId argument missing')
  })

  it('returns an error string (not a throw) when fileId is not a string', async () => {
    const result = await readTextFileTool.execute({ fileId: 42 }, makeContext())
    expect(result).toContain('fileId argument missing')
  })
})
