import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, enableAppendOnlyTableWrites } from '@/lib/assistant-prompts'
import { wipeAllData } from '@/lib/data-file'
import { listClassificationNotes } from '@/lib/model/classification-notes'
import { accountsTable, confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import type { SourceFile, SourceRow } from '@/lib/model/types'
import { requestOpenAiChatMessage } from '@/lib/openai-client'
import { requestChatMessage, type OpenRouterMessage } from '@/lib/openrouter'
import { runConversation, type ConversationUsage } from './run-conversation'
import { toolsForRequest } from './registry'

/**
 * The assistant, run for real, against a real vault.
 *
 * Every other test in this suite stubs `requestFn` and checks what the app does with an
 * answer it was handed. This one hands the model nothing: it sends the actual system
 * prompt and the actual tool schemas to an actual model, and then looks at the database.
 * It is the only check that can catch the class of bug the rest cannot — a tool whose
 * description reads one way to us and another to the thing reading it. Every bug it has
 * found so far was of that kind: a wording, not a branch.
 *
 * It costs money and it can fail without anything being broken, so it is skipped unless
 * AGENT_E2E is set, and it is the last thing run rather than the first:
 *
 *     set -a && . ./.env && set +a
 *     docker compose exec -T -e AGENT_E2E=1 -e OPENAI_API_KEY frontend npx vitest run agent-e2e
 *
 * The container mounts frontend/ alone, so the key is passed in rather than read: the
 * repo's .env is git-ignored and holds it. OPENROUTER_KEY runs through OpenRouter,
 * OPENAI_API_KEY straight at OpenAI, and AGENT_E2E_MODEL picks the model.
 *
 * Rules for anything added here:
 *
 * - **A fresh conversation per scenario.** Never chain one onto another. A scenario pays
 *   for a system prompt, one user message and the rounds it needs, and nothing else.
 * - **Assert on the database, not on the prose.** Wording varies between models and
 *   between runs; row counts do not. A test that greps the reply tests the model.
 * - **Write scenarios any competent model should pass.** Then a failure means the app
 *   misled it, which is the only thing this is here to find.
 * - **Read a failure against the model that produced it.** The default is small and cheap,
 *   which is what makes it a good detector of confusing wording and a bad judge of
 *   anything subtle: it can talk itself into a mistake nothing in the app caused. Before
 *   changing code over a failure, re-run the one scenario on a larger model.
 */
/** Whichever key is around, and the client that key belongs to. */
const ROUTED = process.env.OPENROUTER_KEY ?? ''
const KEY = ROUTED || (process.env.OPENAI_API_KEY ?? '')
const client = ROUTED ? requestChatMessage : requestOpenAiChatMessage
/**
 * With AGENT_E2E_TRACE=1, what the tools said back.
 *
 * Every request carries the whole conversation so far, tool results included, so the
 * client wrapper can read them without runConversation having to report them. A refusal
 * is the thing worth reading: it is the app telling the model something, in wording
 * nobody has watched a model read.
 */
const request: typeof requestChatMessage = async (apiKey, model, messages, tools) => {
  if (process.env.AGENT_E2E_TRACE === '1') {
    for (const message of messages.slice(-4)) {
      if (message.role === 'tool' && typeof message.content === 'string') {
        console.info(`  → ${message.content.slice(0, 400)}`)
      }
    }
  }
  return await client(apiKey, model, messages, tools)
}
/** OpenRouter namespaces its ids; OpenAI's own API wants the bare one. */
const MODEL = process.env.AGENT_E2E_MODEL ?? (ROUTED ? 'openai/gpt-5.6-luna' : 'gpt-5.6-luna')
const enabled = process.env.AGENT_E2E === '1' && KEY !== ''

const spent: ConversationUsage[] = []

/** One scenario: a fresh conversation, one message, the real model, the real tools. */
async function ask(text: string): Promise<string> {
  return await runConversation({
    apiKey: KEY,
    model: MODEL,
    messages: [
      { role: 'system', content: enableAppendOnlyTableWrites(DEFAULT_SYSTEM_PROMPT) },
      { role: 'user', content: text },
    ] as OpenRouterMessage[],
    context: { attachments: [], translate: (key: string) => key },
    tools: toolsForRequest(),
    requestFn: request,
    onUsage: (usage) => { spent[spent.length - 1] = usage },
  })
}

/** Started before each scenario so the line printed at the end is per scenario. */
function startAccounting() { spent.push({} as ConversationUsage) }

describe.skipIf(!enabled)('the assistant, against a real vault', () => {
  beforeEach(async () => {
    await wipeAllData()
    // Every row needs an account, so one exists before anything is asked of it.
    await accountsTable.add({ createdAt: Date.now(), data: { name: 'Nubank', kind: 'checking' } })
    startAccounting()
  })

  it('imports a pasted table and gets its columns onto the three that matter', async () => {
    await ask(
      'Here is a bank export. Import it as a source file called "e2e-bank.csv", put its rows where they '
      + 'belong and get its columns assigned. Stop before confirming anything — I want to look at it first.\n\n'
      + 'Data,Descrição,Valor\n'
      + '2026-03-01,Mercado Sao Jorge,-120.50\n'
      + '2026-03-02,Salario,4200.00\n'
      + '2026-03-03,Uber trip,-31.90\n',
    )

    const stored = (await sourceFilesTable.toArray())[0]
    // A file emptied by confirmation retires itself, so an absent file means either that
    // nothing was imported or that it was carried further than the message asked.
    const confirmed = await confirmedRowsTable.count()
    expect(stored, confirmed > 0 ? `nothing was imported; ${confirmed} rows went straight to confirmed` : 'no source file was created').toBeDefined()
    const file = stored.data as SourceFile
    expect(file.originalColumns).toEqual(['Data', 'Descrição', 'Valor'])
    // The assignable columns, however the model phrased its way there.
    expect(Object.values(file.assignments ?? {})).toEqual(expect.arrayContaining(['date', 'price']))
    expect((await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === stored.id)).toHaveLength(3)
  }, 180_000)

  it('will not write a note that says nothing about what it covers', async () => {
    await ask('Write a classification note for the confirmed data: Mercado Sao Jorge is a supermarket, so its rows are groceries.')

    const notes = await listClassificationNotes()
    // It may ask instead of writing, which is a fine answer. What it may not do is store a
    // scope of blanks — the tool refuses that, and the refusal has to be followable.
    for (const note of notes) {
      expect(note.scope, `note ${note.id} was stored with no scope at all`).toBeDefined()
      for (const [field, value] of Object.entries(note.scope!)) {
        expect(value.trim(), `note ${note.id} left ${field} blank`).not.toBe('')
      }
    }
  }, 180_000)

  it('keeps one memory entry per scope instead of writing the same thing twice', async () => {
    await ask('Remember for next time: "Paygo*Baita Tche" on the confirmed data is a restaurant. Put it in your memory.')
    expect(await listClassificationNotes(undefined, 'memory')).toHaveLength(1)

    // A second conversation, knowing nothing, told something about the same subject. The
    // memory is one record read whole, so this must find the entry and rewrite it.
    startAccounting()
    await ask('Remember too: "San Paolo - Salvador S" on the confirmed data is an ice cream shop. Put it in your memory with anything already there.')

    // Two merchants in the same section and screen: the assistant may hold them in one
    // entry or in two scoped apart, but neither fact may be lost to the other, and the
    // same scope may not appear twice.
    const entries = await listClassificationNotes(undefined, 'memory')
    const written = entries.map((entry) => entry.text).join('\n')
    expect(written, 'the first fact was lost when the second arrived').toContain('Baita Tche')
    expect(written, 'the second fact was not written down').toContain('San Paolo')
    const scopes = entries.map((entry) => JSON.stringify(entry.scope))
    expect(new Set(scopes).size, `two entries share one scope: ${entries.map((entry) => entry.title).join(' | ')}`).toBe(entries.length)
  }, 240_000)

  afterAll(() => {
    if (!enabled) return
    const total = spent.filter((usage) => usage.totalTokens)
    // Which tool refused is the whole point: a refusal the model recovered from is a
    // wording that cost a round, and one it did not recover from is a bug in the making.
    const byTool = new Map<string, { calls: number; errors: number }>()
    for (const usage of total) {
      for (const [name, tool] of Object.entries(usage.tools)) {
        const seen = byTool.get(name) ?? { calls: 0, errors: 0 }
        byTool.set(name, { calls: seen.calls + tool.calls, errors: seen.errors + tool.errors })
      }
    }
    console.info(`\nagent-e2e (${MODEL}): ${total.length} scenarios, ${total.reduce((sum, usage) => sum + usage.totalTokens, 0)} tokens, `
      + `${total.reduce((sum, usage) => sum + usage.toolCalls, 0)} tool calls, `
      + `${total.reduce((sum, usage) => sum + usage.toolErrors, 0)} of them refused.\n`
      + [...byTool].map(([name, tool]) => `  ${name}: ${tool.calls}${tool.errors ? ` (${tool.errors} refused)` : ''}`).join('\n') + '\n')
  })
})
