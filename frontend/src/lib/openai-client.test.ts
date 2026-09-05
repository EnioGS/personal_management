import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestOpenAiChatMessage } from './openai-client'

function reply(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }) }
}

function refusal(message: string) {
  return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message } }), statusText: 'Bad Request' }
}

afterEach(() => { vi.unstubAllGlobals() })

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as { body: string }).body)
}

describe('talking to OpenAI', () => {
  it('asks with the parameter current models take', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('hello'))
    vi.stubGlobal('fetch', fetchMock)

    await requestOpenAiChatMessage('k', 'gpt-5.6', [{ role: 'user', content: 'hi' }])

    expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({ max_completion_tokens: expect.any(Number) })
    expect(bodyOf(fetchMock.mock.calls[0])).not.toHaveProperty('max_tokens')
  })

  it('falls back to the old name when the model knows only that one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal("Unsupported parameter: 'max_completion_tokens' is not supported with this model. Use 'max_tokens' instead."))
      .mockResolvedValueOnce(reply('hello'))
    vi.stubGlobal('fetch', fetchMock)

    const message = await requestOpenAiChatMessage('k', 'older-model', [{ role: 'user', content: 'hi' }])

    expect(message.content).toBe('hello')
    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({ max_tokens: expect.any(Number) })
  })

  it('reports any other refusal rather than retrying it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(refusal('Incorrect API key provided.'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestOpenAiChatMessage('k', 'gpt-5.6', [{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Incorrect API key/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('models that will not take tools while reasoning', () => {
  it('goes to the Responses API, where they keep both, rather than turning thinking off', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal("Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] }) })
    vi.stubGlobal('fetch', fetchMock)

    const message = await requestOpenAiChatMessage('k', 'gpt-5.6-terra', [{ role: 'user', content: 'hi' }], [
      { type: 'function', function: { name: 'query_vault', description: 'reads', parameters: {} } },
    ])

    expect(message.content).toBe('done')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses')
  })

  it('turns reasoning off only for a model that refuses without offering that door', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal("Function tools with reasoning_effort are not supported. Set reasoning_effort to 'none'."))
      .mockResolvedValueOnce(reply('done'))
    vi.stubGlobal('fetch', fetchMock)

    await requestOpenAiChatMessage('k', 'some-model', [{ role: 'user', content: 'hi' }], [
      { type: 'function', function: { name: 'query_vault', description: 'reads', parameters: {} } },
    ])

    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({ reasoning_effort: 'none' })
  })

  it('never volunteers it when the model has not asked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('hello'))
    vi.stubGlobal('fetch', fetchMock)

    await requestOpenAiChatMessage('k', 'gpt-5.6', [{ role: 'user', content: 'hi' }])

    expect(bodyOf(fetchMock.mock.calls[0])).not.toHaveProperty('reasoning_effort')
  })
})
