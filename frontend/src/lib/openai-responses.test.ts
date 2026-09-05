import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromResponsesOutput, requestOpenAiResponse, toResponsesInput, toResponsesTools } from './openai-responses'
import type { OpenRouterMessage } from './openrouter'

afterEach(() => { vi.unstubAllGlobals() })

describe('a chat-shaped conversation as Responses input', () => {
  it('keeps plain messages, and unfolds a round of tool calls into items', () => {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'label the spending' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'query_vault', arguments: '{"statement":"SELECT 1"}' } }] },
      { role: 'tool', content: '{"rows":[[1]]}', tool_call_id: 'call_1' },
    ]

    expect(toResponsesInput(messages)).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'label the spending' },
      { type: 'function_call', call_id: 'call_1', name: 'query_vault', arguments: '{"statement":"SELECT 1"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"rows":[[1]]}' },
    ])
  })

  it('declares tools flat, as this API wants them', () => {
    expect(toResponsesTools([{ type: 'function', function: { name: 'mark_rows', description: 'marks', parameters: { type: 'object' } } }]))
      .toEqual([{ type: 'function', name: 'mark_rows', description: 'marks', parameters: { type: 'object' } }])
  })
})

describe('reading the reply back', () => {
  it('joins the text, keeps the calls, and reads the usage under its own names', () => {
    const message = fromResponsesOutput({
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'Here is ' }, { type: 'output_text', text: 'what I found.' }] },
        { type: 'function_call', call_id: 'call_9', name: 'mark_rows', arguments: '{"table":"confirmed"}' },
      ],
      usage: { input_tokens: 900, output_tokens: 120, total_tokens: 1020 },
    })

    expect(message.content).toBe('Here is what I found.')
    expect(message.tool_calls).toEqual([{ id: 'call_9', type: 'function', function: { name: 'mark_rows', arguments: '{"table":"confirmed"}' } }])
    expect(message.usage).toEqual({ promptTokens: 900, completionTokens: 120, totalTokens: 1020 })
  })

  it('reads a reply that is only tool calls, which is most rounds of real work', () => {
    const message = fromResponsesOutput({
      output: [{ type: 'function_call', call_id: 'c', name: 'query_vault', arguments: '{}' }],
    })

    expect(message.content).toBeNull()
    expect(message.tool_calls).toHaveLength(1)
  })

  it('says so when the model returned nothing at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: [{ type: 'reasoning', summary: [] }], status: 'incomplete' }),
    }))

    await expect(requestOpenAiResponse('k', 'gpt-5.6-terra', [{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/returned nothing \(incomplete\)/)
  })

  it('sends the conversation and the tools to the responses endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const message = await requestOpenAiResponse('k', 'gpt-5.6-terra', [{ role: 'user', content: 'hi' }], [
      { type: 'function', function: { name: 'query_vault', description: 'reads', parameters: {} } },
    ])

    expect(message.content).toBe('done')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body).toMatchObject({ model: 'gpt-5.6-terra', max_output_tokens: expect.any(Number) })
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'query_vault' })
  })
})

describe('an image in a message', () => {
  it('is renamed to what this API calls it, and carries its data URL directly', () => {
    const input = toResponsesInput([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what does this show?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
      },
    ])

    expect(input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'what does this show?' },
          { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
        ],
      },
    ])
  })

  it('leaves a message of plain words a plain string', () => {
    expect(toResponsesInput([{ role: 'user', content: 'hello' }])).toEqual([{ role: 'user', content: 'hello' }])
  })
})
