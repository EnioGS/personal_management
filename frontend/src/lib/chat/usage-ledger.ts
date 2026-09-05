import { refreshLocalStores } from '@/lib/local-store/create-local-list-store'
import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import { profileUsageTable, usageTotalsTable } from './conversations-db'
import { DEFAULT_PROFILE } from '@/lib/prompts/profiles'

/** Everything spent since the beginning, whatever became of the conversations that spent it. */
export interface UsageTotals {
  tokens: number
  requests: number
  cost: number
  /** Messages counted, so an average is possible without keeping every one of them. */
  messages: number
  /** The two halves of the tokens, priced differently and worth watching apart. */
  promptTokens: number
  completionTokens: number
  /** What the provider served from cache, and what was spent thinking rather than saying. */
  cachedTokens: number
  reasoningTokens: number
  /** The largest prompt any round carried, which is what a context window is measured against. */
  peakPromptTokens: number
  /** Wall clock, and the part of it spent inside tools rather than waiting on the model. */
  elapsedMs: number
  toolMs: number
  /** How much the wording made the model reach for tools, and how often it was refused. */
  toolCalls: number
  toolErrors: number
  toolsetsOpened: number
  /** Messages that ended in an error, and the longest round trip any of them took. */
  failures: number
  slowestMs: number
  /** Characters written back: verbosity, without needing a tokenizer to see it. */
  replyChars: number
  /** When this profile, provider and model were first and last used. */
  firstUsedAt: number
  lastUsedAt: number
}

/**
 * One tally per profile, per provider, per model.
 *
 * A profile is worth having only if what it costs can be compared with what another
 * costs, and the comparison is only fair when the model is the same — so the tally is
 * split three ways and summed back up in whichever direction the question needs.
 */
export interface UsageRecord extends UsageTotals {
  profile: string
  provider: string
  model: string
  /** Every tool this profile called, by name — calls, refusals, and time spent in each. */
  tools: Record<string, { calls: number; errors: number; ms: number }>
}

const EMPTY: UsageTotals = {
  tokens: 0, requests: 0, cost: 0, messages: 0,
  promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0, peakPromptTokens: 0,
  elapsedMs: 0, toolMs: 0, toolCalls: 0, toolErrors: 0, toolsetsOpened: 0,
  failures: 0, slowestMs: 0, replyChars: 0, firstUsedAt: 0, lastUsedAt: 0,
}

/** Live, so the table on the settings screen fills in as a conversation runs. */
export const useUsageRecordsStore = createLocalListStore<UsageRecord>(profileUsageTable)

/** The stored shape, with the defaults an older row predates. */
export function asUsageRecord(record: Partial<UsageRecord>): UsageRecord {
  return { profile: DEFAULT_PROFILE, provider: 'unknown', model: 'unknown', tools: {}, ...EMPTY, ...record }
}

export async function readUsageRecords(): Promise<UsageRecord[]> {
  return (await profileUsageTable.toArray()).map((stored) => asUsageRecord(stored.data as Partial<UsageRecord>))
}

/**
 * Clears the per-profile measurements, and only those.
 *
 * The lifetime bill the chat shows is a different fact kept in a different table: money
 * spent is not unspent by deciding to measure again from here.
 */
export async function resetProfileUsage(): Promise<void> {
  await profileUsageTable.clear()
  await refreshLocalStores('profileUsage')
}

/** Adding two tallies: counters add, peaks take the larger, and the dates take the outer. */
export function sumUsage(records: UsageTotals[]): UsageTotals {
  return records.reduce((total, record) => ({
    ...total,
    tokens: total.tokens + record.tokens,
    requests: total.requests + record.requests,
    cost: total.cost + record.cost,
    messages: total.messages + record.messages,
    promptTokens: total.promptTokens + record.promptTokens,
    completionTokens: total.completionTokens + record.completionTokens,
    cachedTokens: total.cachedTokens + record.cachedTokens,
    reasoningTokens: total.reasoningTokens + record.reasoningTokens,
    peakPromptTokens: Math.max(total.peakPromptTokens, record.peakPromptTokens),
    elapsedMs: total.elapsedMs + record.elapsedMs,
    toolMs: total.toolMs + record.toolMs,
    toolCalls: total.toolCalls + record.toolCalls,
    toolErrors: total.toolErrors + record.toolErrors,
    toolsetsOpened: total.toolsetsOpened + record.toolsetsOpened,
    failures: total.failures + record.failures,
    slowestMs: Math.max(total.slowestMs, record.slowestMs),
    replyChars: total.replyChars + record.replyChars,
    firstUsedAt: Math.min(total.firstUsedAt || record.firstUsedAt, record.firstUsedAt || total.firstUsedAt),
    lastUsedAt: Math.max(total.lastUsedAt, record.lastUsedAt),
  }), EMPTY)
}

/** The questions the raw counters exist to answer, worked out rather than stored. */
export function derived(record: UsageTotals) {
  const per = (value: number) => (record.messages > 0 ? value / record.messages : 0)
  return {
    tokensPerMessage: per(record.tokens),
    roundsPerMessage: per(record.requests),
    costPerMessage: per(record.cost),
    secondsPerMessage: per(record.elapsedMs) / 1000,
    toolsPerMessage: per(record.toolCalls),
    charsPerMessage: per(record.replyChars),
    cacheRate: record.promptTokens > 0 ? record.cachedTokens / record.promptTokens : 0,
    toolErrorRate: record.toolCalls > 0 ? record.toolErrors / record.toolCalls : 0,
    failureRate: record.messages > 0 ? record.failures / record.messages : 0,
    /** How much of the waiting was the app's own work rather than the model's. */
    toolShare: record.elapsedMs > 0 ? record.toolMs / record.elapsedMs : 0,
  }
}

/** The lifetime bill, which the chat's own line reads: one row, and nothing resets it. */
export async function readUsageTotals(): Promise<UsageTotals> {
  const [stored] = await usageTotalsTable.toArray()
  return stored ? { ...EMPTY, ...(stored.data as UsageTotals) } : EMPTY
}

/**
 * Adds one exchange to the running total.
 *
 * Kept outside the conversations because deleting a conversation should not unspend what
 * it spent: the tally is about the money and the tokens, which are gone either way. One
 * row, added to rather than appended, since nothing here needs a history.
 */
export interface Exchange {
  tokens: number
  requests: number
  cost: number | null
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  peakPromptTokens?: number
  elapsedMs?: number
  toolMs?: number
  toolCalls?: number
  toolErrors?: number
  toolsetsOpened?: number
  replyChars?: number
  /** Whether the message ended in an error rather than an answer. */
  failed?: boolean
  tools?: Record<string, { calls: number; errors: number; ms: number }>
}

export async function recordUsage(
  exchange: Exchange,
  under: { profile: string; provider: string; model: string },
): Promise<void> {
  if (exchange.tokens <= 0 && !exchange.failed) return

  // Two records of the same event, deliberately: the lifetime bill, which nothing but
  // wiping the vault resets, and the profile's own measurements, which are meant to be
  // cleared when an experiment is over.
  const [lifetime] = await usageTotalsTable.toArray()
  const before = lifetime ? { ...EMPTY, ...(lifetime.data as UsageTotals) } : EMPTY
  const billed: UsageTotals = {
    ...before,
    tokens: before.tokens + exchange.tokens,
    requests: before.requests + exchange.requests,
    cost: before.cost + (exchange.cost ?? 0),
    messages: before.messages + 1,
  }
  if (lifetime) await usageTotalsTable.update(lifetime.id, { data: billed })
  else await usageTotalsTable.add({ createdAt: Date.now(), data: billed })

  const rows = await profileUsageTable.toArray()
  const stored = rows.find((row) => {
    const record = row.data as Partial<UsageRecord>
    return (record.profile ?? DEFAULT_PROFILE) === under.profile && record.provider === under.provider && record.model === under.model
  })
  const previous = stored ? asUsageRecord(stored.data as Partial<UsageRecord>) : asUsageRecord({})
  const now = Date.now()
  const at = (value: number | undefined) => value ?? 0

  const tools = { ...previous.tools }
  for (const [name, tally] of Object.entries(exchange.tools ?? {})) {
    const before = tools[name] ?? { calls: 0, errors: 0, ms: 0 }
    tools[name] = { calls: before.calls + tally.calls, errors: before.errors + tally.errors, ms: before.ms + tally.ms }
  }

  const next: UsageRecord = {
    ...under,
    tools,
    tokens: previous.tokens + exchange.tokens,
    requests: previous.requests + exchange.requests,
    cost: previous.cost + (exchange.cost ?? 0),
    messages: previous.messages + 1,
    promptTokens: previous.promptTokens + at(exchange.promptTokens),
    completionTokens: previous.completionTokens + at(exchange.completionTokens),
    cachedTokens: previous.cachedTokens + at(exchange.cachedTokens),
    reasoningTokens: previous.reasoningTokens + at(exchange.reasoningTokens),
    peakPromptTokens: Math.max(previous.peakPromptTokens, at(exchange.peakPromptTokens)),
    elapsedMs: previous.elapsedMs + at(exchange.elapsedMs),
    toolMs: previous.toolMs + at(exchange.toolMs),
    toolCalls: previous.toolCalls + at(exchange.toolCalls),
    toolErrors: previous.toolErrors + at(exchange.toolErrors),
    toolsetsOpened: previous.toolsetsOpened + at(exchange.toolsetsOpened),
    failures: previous.failures + (exchange.failed ? 1 : 0),
    slowestMs: Math.max(previous.slowestMs, at(exchange.elapsedMs)),
    replyChars: previous.replyChars + at(exchange.replyChars),
    firstUsedAt: previous.firstUsedAt || now,
    lastUsedAt: now,
  }

  if (stored) await profileUsageTable.update(stored.id, { data: next })
  else await profileUsageTable.add({ createdAt: Date.now(), data: next })
  await refreshLocalStores('usageTotals', 'profileUsage')
}
