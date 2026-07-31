import { describe, expect, it } from 'vitest'
import type { ChatAttachment } from '@/lib/chat-attachments'
import { readCsvTool } from './read-csv'

const CSV_CONTENT = 'a,b\n1,x\n2,y\n3,z\n4,w\n5,v'

function csvAttachment(content = CSV_CONTENT): ChatAttachment {
  return { id: 'f1', name: 'data.csv', type: 'text/csv', content }
}

function makeContext(attachments: ChatAttachment[] = [csvAttachment()]) {
  return { attachments }
}

describe('readCsvTool', () => {
  it('returns an error string (not a throw) for an unknown fileId', async () => {
    const result = await readCsvTool.execute({ fileId: 'missing' }, makeContext([]))
    expect(result).toContain('no attached file')
  })

  it('returns an error string when fileId is missing', async () => {
    const result = await readCsvTool.execute({}, makeContext([]))
    expect(result).toContain('fileId argument missing')
  })

  it('rejects a non-CSV attachment', async () => {
    const attachment: ChatAttachment = { id: 'f2', name: 'notes.txt', type: 'text/plain', content: 'hi' }
    const result = await readCsvTool.execute({ fileId: 'f2' }, makeContext([attachment]))
    expect(result).toContain('is not a CSV file')
  })

  it('defaults to head mode with 10 rows', async () => {
    const result = await readCsvTool.execute({ fileId: 'f1' }, makeContext())
    expect(result).toContain('5 row(s)')
    expect(result).toContain('columns: a, b')
    expect(result).toContain('head 5 of 5 rows')
  })

  it('respects an explicit head rowCount', async () => {
    const result = await readCsvTool.execute({ fileId: 'f1', mode: 'head', rowCount: 2 }, makeContext())
    expect(result).toContain('head 2 of 5 rows')
    expect(result).toContain('1,x')
    expect(result).not.toContain('3,z')
  })

  it('returns the last rows for tail mode', async () => {
    const result = await readCsvTool.execute({ fileId: 'f1', mode: 'tail', rowCount: 2 }, makeContext())
    expect(result).toContain('tail 2 of 5 rows')
    expect(result).toContain('5,v')
    expect(result).not.toContain('1,x')
  })

  it('returns all rows for full mode, ignoring rowCount', async () => {
    const result = await readCsvTool.execute({ fileId: 'f1', mode: 'full', rowCount: 1 }, makeContext())
    expect(result).toContain('all 5 rows')
    expect(result).toContain('1,x')
    expect(result).toContain('5,v')
  })

  it('falls back to the default row count for a non-positive rowCount', async () => {
    const result = await readCsvTool.execute({ fileId: 'f1', mode: 'head', rowCount: -3 }, makeContext())
    expect(result).toContain('head 5 of 5 rows')
  })
})
