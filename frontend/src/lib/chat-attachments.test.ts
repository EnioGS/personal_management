import { describe, expect, it } from 'vitest'
import { formatAttachmentsForPrompt, readAttachedFile, type ChatAttachment } from './chat-attachments'

function makeFile(name: string, content: string, options?: FilePropertyBag): File {
  return new File([content], name, options)
}

describe('readAttachedFile', () => {
  it('accepts a .txt file', async () => {
    const result = await readAttachedFile(makeFile('notes.txt', 'hello world'))
    expect('attachment' in result).toBe(true)
    if ('attachment' in result) {
      expect(result.attachment.name).toBe('notes.txt')
      expect(result.attachment.type).toBe('text/plain')
      expect(result.attachment.content).toBe('hello world')
      expect(result.attachment.id).toBeTruthy()
    }
  })

  it('accepts a .md file', async () => {
    const result = await readAttachedFile(makeFile('readme.md', '# Title'))
    expect('attachment' in result).toBe(true)
    if ('attachment' in result) expect(result.attachment.type).toBe('text/markdown')
  })

  it('accepts an uppercase extension', async () => {
    const result = await readAttachedFile(makeFile('NOTES.TXT', 'hi'))
    expect('attachment' in result).toBe(true)
  })

  it('rejects unsupported extensions', async () => {
    const result = await readAttachedFile(makeFile('data.csv', 'a,b,c'))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('only .txt and .md files')
  })

  it('rejects files over the size cap', async () => {
    const bigContent = 'a'.repeat(2 * 1024 * 1024 + 1)
    const result = await readAttachedFile(makeFile('big.txt', bigContent))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('too large')
  })
})

describe('formatAttachmentsForPrompt', () => {
  it('returns an empty string for no attachments', () => {
    expect(formatAttachmentsForPrompt([])).toBe('')
  })

  it('lists id/name/type for each attachment', () => {
    const attachments: ChatAttachment[] = [
      { id: 'abc-123', name: 'notes.txt', type: 'text/plain', content: 'x' },
      { id: 'def-456', name: 'readme.md', type: 'text/markdown', content: 'y' },
    ]
    const result = formatAttachmentsForPrompt(attachments)
    expect(result).toContain('abc-123')
    expect(result).toContain('notes.txt')
    expect(result).toContain('text/plain')
    expect(result).toContain('def-456')
    expect(result).toContain('readme.md')
    expect(result).toContain('text/markdown')
  })
})
