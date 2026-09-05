import { describe, expect, it, vi } from 'vitest'
import type { OpenRouterMessage } from '@/lib/openrouter'
import { runConversation } from './run-conversation'
import type { ToolContext } from './types'

const context: ToolContext = { attachments: [{ id: 'f1', name: 'notes.txt', type: 'text/plain', content: 'file body' }], translate: (key: string) => key }
const baseMessages: OpenRouterMessage[] = [{ role: 'system', content: 'system prompt' }]

function textMessage(content: string) {
  return { role: 'assistant' as const, content, tool_calls: undefined }
}

function toolCallMessage(id: string, name: string, args: unknown) {
  return {
    role: 'assistant' as const,
    content: null,
    tool_calls: [{ id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } }],
  }
}

describe('runConversation', () => {
  it('passes through a plain-text response with a single request', async () => {
    const requestFn = vi.fn().mockResolvedValue(textMessage('hi there'))
    const result = await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })
    expect(result).toBe('hi there')
    expect(requestFn).toHaveBeenCalledTimes(1)
  })

  it('round-trips a single tool call before returning the final answer', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(toolCallMessage('call_1', 'read_text_file', { fileId: 'f1' }))
      .mockResolvedValueOnce(textMessage('the file says file body'))

    const result = await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })

    expect(result).toBe('the file says file body')
    expect(requestFn).toHaveBeenCalledTimes(2)

    const secondCallMessages = requestFn.mock.calls[1][2] as OpenRouterMessage[]
    const assistantMsg = secondCallMessages.find((m) => m.role === 'assistant' && m.tool_calls)
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool')
    expect(assistantMsg?.tool_calls?.[0].id).toBe('call_1')
    expect(toolMsg?.tool_call_id).toBe('call_1')
    expect(toolMsg?.content).toBe('file body')
  })

  it('handles multiple tool-call rounds in sequence', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(toolCallMessage('call_1', 'read_text_file', { fileId: 'f1' }))
      .mockResolvedValueOnce(toolCallMessage('call_2', 'read_text_file', { fileId: 'missing' }))
      .mockResolvedValueOnce(textMessage('done'))

    const result = await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })

    expect(result).toBe('done')
    expect(requestFn).toHaveBeenCalledTimes(3)
  })

  it('allows a long labelling session before giving up: the default cap is well past a handful of rounds', async () => {
    const requestFn = vi.fn().mockResolvedValue(toolCallMessage('call_x', 'read_text_file', { fileId: 'f1' }))

    await expect(runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })).rejects.toThrow(/did not produce a final answer/)
    expect(requestFn.mock.calls.length).toBeGreaterThanOrEqual(30)
  })

  it('rejects once maxIterations is exhausted, calling requestFn exactly that many times', async () => {
    const requestFn = vi.fn().mockResolvedValue(toolCallMessage('call_x', 'read_text_file', { fileId: 'f1' }))

    await expect(
      runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn, maxIterations: 3 }),
    ).rejects.toThrow(/did not produce a final answer/)
    expect(requestFn).toHaveBeenCalledTimes(3)
  })

  it('injects an error result for an unknown tool name and continues the loop', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(toolCallMessage('call_1', 'does_not_exist', {}))
      .mockResolvedValueOnce(textMessage('recovered'))

    const result = await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })

    expect(result).toBe('recovered')
    const secondCallMessages = requestFn.mock.calls[1][2] as OpenRouterMessage[]
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('unknown tool')
  })

  it('reports waiting/tool status in order via onStatus', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(toolCallMessage('call_1', 'read_text_file', { fileId: 'f1' }))
      .mockResolvedValueOnce(textMessage('done'))
    const statuses: unknown[] = []

    await runConversation({
      apiKey: 'k',
      model: 'm',
      messages: baseMessages,
      context,
      requestFn,
      onStatus: (status) => statuses.push(status),
    })

    expect(statuses).toEqual([
      { type: 'waiting' },
      { type: 'tool', name: 'read_text_file' },
      { type: 'waiting' },
    ])
  })

  it('injects an error result for malformed tool-call arguments JSON and continues the loop', async () => {
    const malformed = {
      role: 'assistant' as const,
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function' as const, function: { name: 'read_text_file', arguments: '{not json' } }],
    }
    const requestFn = vi.fn().mockResolvedValueOnce(malformed).mockResolvedValueOnce(textMessage('recovered'))

    const result = await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })

    expect(result).toBe('recovered')
    const secondCallMessages = requestFn.mock.calls[1][2] as OpenRouterMessage[]
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('could not parse arguments')
  })
})

describe('keeping the screens in step with the tools', () => {
  it('re-reads the local stores after a tool runs, so a change made by the assistant is on screen', async () => {
    const { useLabelRulesStore } = await import('@/lib/model/model-stores')
    const { labelRulesTable } = await import('@/lib/model/model-db')
    const { findTool } = await import('./registry')
    await useLabelRulesStore.getState().refresh()
    expect(useLabelRulesStore.getState().items).toHaveLength(0)

    // A tool that writes without going through the store — as every ingestion tool does.
    const write = vi.fn(async () => {
      await labelRulesTable.add({ createdAt: 1, data: { context: 'source', field: 'description', contains: 'Mercado', labels: { category: 'mercado' }, rationale: 'x', createdBy: 'assistant', createdAt: 1 } })
      return 'written'
    })
    const original = findTool('read_text_file')!.execute
    findTool('read_text_file')!.execute = write

    try {
      const requestFn = vi
        .fn()
        .mockResolvedValueOnce(toolCallMessage('call_1', 'read_text_file', { fileId: 'f1' }))
        .mockResolvedValueOnce(textMessage('done'))
      await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn })

      expect(useLabelRulesStore.getState().items.map((item) => item.contains)).toEqual(['Mercado'])
    } finally {
      findTool('read_text_file')!.execute = original
    }
  })
})

describe('what a message cost', () => {
  it('adds up every round of a tool-call loop, and reports the last prompt as the live context', async () => {
    const withUsage = (message: Record<string, unknown>, promptTokens: number, completionTokens: number) => ({
      ...message,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    })
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(withUsage(toolCallMessage('call_1', 'read_text_file', { fileId: 'f1' }), 1000, 50))
      .mockResolvedValueOnce(withUsage(textMessage('done'), 1400, 120))
    const seen: unknown[] = []

    await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn, onUsage: (usage) => seen.push(usage) })

    expect(seen.at(-1)).toEqual({ rounds: 2, promptTokens: 2400, completionTokens: 170, totalTokens: 2570, lastPromptTokens: 1400 })
  })

  it('says nothing when the API reports no usage, rather than inventing zeros', async () => {
    const requestFn = vi.fn().mockResolvedValue(textMessage('done'))
    const seen: unknown[] = []

    await runConversation({ apiKey: 'k', model: 'm', messages: baseMessages, context, requestFn, onUsage: (usage) => seen.push(usage) })

    expect(seen).toEqual([])
  })
})
