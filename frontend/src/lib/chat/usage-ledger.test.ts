import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { derived, readUsageRecords, readUsageTotals, recordUsage, resetProfileUsage, type UsageTotals } from './usage-ledger'

/** A tally of nothing, for the derivations that only care about the fields they read. */
const EMPTY_FOR_TEST = {
  tokens: 0, requests: 0, cost: 0, messages: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0,
  reasoningTokens: 0, peakPromptTokens: 0, elapsedMs: 0, toolMs: 0, toolCalls: 0, toolErrors: 0,
  toolsetsOpened: 0, failures: 0, slowestMs: 0, replyChars: 0, firstUsedAt: 0, lastUsedAt: 0,
} satisfies UsageTotals

const under = { profile: 'Default', provider: 'openrouter', model: 'a-model' }

describe('what has been spent altogether', () => {
  beforeEach(async () => { await wipeAllData() })

  it('starts at nothing and adds each exchange to one running total', async () => {
    expect(await readUsageTotals()).toMatchObject({ tokens: 0, requests: 0, cost: 0, messages: 0 })

    await recordUsage({ tokens: 4820, requests: 1, cost: 0.0012 }, under)
    await recordUsage({ tokens: 12182, requests: 2, cost: 0.0024 }, under)

    expect(await readUsageTotals()).toMatchObject({ tokens: 17002, requests: 3, cost: 0.0036, messages: 2 })
  })

  it('counts an exchange whose price nobody knows, without pretending it was free', async () => {
    await recordUsage({ tokens: 100, requests: 1, cost: null }, under)

    expect(await readUsageTotals()).toMatchObject({ tokens: 100, cost: 0, messages: 1 })
  })

  it('ignores an exchange that spent nothing at all', async () => {
    await recordUsage({ tokens: 0, requests: 0, cost: null }, under)

    expect(await readUsageTotals()).toMatchObject({ messages: 0 })
  })
})

describe('what each profile and model spent', () => {
  beforeEach(async () => { await wipeAllData() })

  it('keeps a tally of its own for every profile, provider and model', async () => {
    await recordUsage({ tokens: 100, requests: 1, cost: 0.01 }, { profile: 'Default', provider: 'openrouter', model: 'a' })
    await recordUsage({ tokens: 200, requests: 1, cost: 0.02 }, { profile: 'Terse', provider: 'openrouter', model: 'a' })
    await recordUsage({ tokens: 300, requests: 1, cost: 0.03 }, { profile: 'Terse', provider: 'openai', model: 'b' })
    await recordUsage({ tokens: 50, requests: 1, cost: 0.005 }, { profile: 'Terse', provider: 'openai', model: 'b' })

    const records = await readUsageRecords()
    expect(records).toHaveLength(3)
    expect(records.find((row) => row.profile === 'Terse' && row.model === 'b')).toMatchObject({ tokens: 350, messages: 2 })
    // The old question still has the old answer: everything, however it was split.
    expect(await readUsageTotals()).toMatchObject({ tokens: 650, messages: 4 })
  })
})

describe('everything a message can be measured by', () => {
  beforeEach(async () => { await wipeAllData() })

  it('keeps each counter, takes the larger of the peaks and the outer of the dates', async () => {
    await recordUsage({
      tokens: 1000, requests: 3, cost: 0.01, promptTokens: 900, completionTokens: 100,
      cachedTokens: 400, reasoningTokens: 50, peakPromptTokens: 500, elapsedMs: 4000, toolMs: 1000,
      toolCalls: 4, toolErrors: 1, toolsetsOpened: 1, replyChars: 800,
      tools: { query_vault: { calls: 3, errors: 1, ms: 600 }, mark_rows: { calls: 1, errors: 0, ms: 400 } },
    }, under)
    await recordUsage({
      tokens: 500, requests: 1, cost: 0.005, promptTokens: 450, completionTokens: 50,
      peakPromptTokens: 300, elapsedMs: 1000, toolCalls: 1, toolErrors: 0,
      tools: { query_vault: { calls: 1, errors: 0, ms: 200 } },
    }, under)

    const [record] = await readUsageRecords()
    expect(record).toMatchObject({
      messages: 2, requests: 4, tokens: 1500, promptTokens: 1350, cachedTokens: 400,
      // The peak is the largest any one round reached, never the sum of them.
      peakPromptTokens: 500, slowestMs: 4000, toolCalls: 5, toolErrors: 1,
    })
    expect(record.tools.query_vault).toEqual({ calls: 4, errors: 1, ms: 800 })
    expect(record.firstUsedAt).toBeLessThanOrEqual(record.lastUsedAt)
  })

  it('counts a message that failed, which spent time and told us something even so', async () => {
    await recordUsage({ tokens: 0, requests: 1, cost: null, failed: true, elapsedMs: 900 }, under)

    expect((await readUsageRecords())[0]).toMatchObject({ messages: 1, failures: 1, slowestMs: 900 })
  })

  it('works out the questions the counters exist to answer', () => {
    const rates = derived({
      ...EMPTY_FOR_TEST, messages: 4, requests: 12, tokens: 4000, cost: 0.4, elapsedMs: 8000, toolMs: 2000,
      promptTokens: 1000, cachedTokens: 250, toolCalls: 10, toolErrors: 2, failures: 1,
    })

    expect(rates).toMatchObject({ roundsPerMessage: 3, tokensPerMessage: 1000, costPerMessage: 0.1, secondsPerMessage: 2 })
    expect(rates).toMatchObject({ cacheRate: 0.25, toolErrorRate: 0.2, failureRate: 0.25, toolShare: 0.25 })
  })
})

describe('starting the measurements again', () => {
  beforeEach(async () => { await wipeAllData() })

  it('clears what each profile spent and leaves the lifetime bill alone', async () => {
    await recordUsage({ tokens: 500, requests: 1, cost: 0.05 }, under)
    await recordUsage({ tokens: 300, requests: 1, cost: 0.03 }, { ...under, profile: 'Terse' })
    expect(await readUsageRecords()).toHaveLength(2)
    expect(await readUsageTotals()).toMatchObject({ tokens: 800, messages: 2 })

    await resetProfileUsage()

    expect(await readUsageRecords()).toEqual([])
    // Money spent is not unspent by deciding to measure again from here.
    expect(await readUsageTotals()).toMatchObject({ tokens: 800, messages: 2 })
  })
})
