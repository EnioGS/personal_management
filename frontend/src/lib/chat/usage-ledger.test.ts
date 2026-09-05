import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { recordUsage, readUsageTotals } from './usage-ledger'

describe('what has been spent altogether', () => {
  beforeEach(async () => { await wipeAllData() })

  it('starts at nothing and adds each exchange to one running total', async () => {
    expect(await readUsageTotals()).toEqual({ tokens: 0, requests: 0, cost: 0, messages: 0 })

    await recordUsage({ tokens: 4820, requests: 1, cost: 0.0012 })
    await recordUsage({ tokens: 12182, requests: 2, cost: 0.0024 })

    expect(await readUsageTotals()).toEqual({ tokens: 17002, requests: 3, cost: 0.0036, messages: 2 })
  })

  it('counts an exchange whose price nobody knows, without pretending it was free', async () => {
    await recordUsage({ tokens: 100, requests: 1, cost: null })

    expect(await readUsageTotals()).toMatchObject({ tokens: 100, cost: 0, messages: 1 })
  })

  it('ignores an exchange that spent nothing at all', async () => {
    await recordUsage({ tokens: 0, requests: 0, cost: null })

    expect(await readUsageTotals()).toMatchObject({ messages: 0 })
  })
})
