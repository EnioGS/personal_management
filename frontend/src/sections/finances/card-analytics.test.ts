import { describe, expect, it } from 'vitest'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { currentInvoiceCycle, daysUntil, entriesInInvoice, openInstallments } from './card-analytics'

function entry(overrides: Partial<FilteredEntry> = {}): FilteredEntry {
  return { tableId: 1, date: Date.UTC(2026, 7, 30), amount: 100, direction: 'out', category: 'Food', description: 'Market', subsections: ['spending'], flowRole: 'outflow', ...overrides }
}

describe('card analytics', () => {
  it('finds the current invoice cycle and moves the due date past a later closing day', () => {
    const cycle = currentInvoiceCycle(
      { name: 'Card', accountId: 1, closingDay: 25, dueDay: 2 },
      new Date(Date.UTC(2026, 8, 2)),
    )
    expect(cycle.from).toBe(Date.UTC(2026, 7, 26))
    expect(cycle.to).toBe(Date.UTC(2026, 8, 25))
    expect(cycle.dueDate).toBe(Date.UTC(2026, 9, 2))
  })

  it('keeps only positive entries within an invoice cycle', () => {
    const cycle = { from: Date.UTC(2026, 7, 26), to: Date.UTC(2026, 8, 25), closingDate: Date.UTC(2026, 8, 25) }
    expect(entriesInInvoice([
      entry({ date: Date.UTC(2026, 7, 25) }),
      entry({ date: Date.UTC(2026, 7, 26) }),
      entry({ date: Date.UTC(2026, 8, 25) }),
      entry({ amount: -10 }),
    ], cycle)).toEqual([
      entry({ date: Date.UTC(2026, 7, 26) }),
      entry({ date: Date.UTC(2026, 8, 25) }),
    ])
  })

  it('derives open installment progress and remaining value from imported descriptions', () => {
    expect(openInstallments([
      entry({ description: 'Notebook parcela 2/5', amount: 200 }),
      entry({ description: 'Completed 3/3', amount: 50 }),
    ])).toEqual([
      {
        description: 'Notebook parcela 2/5',
        category: 'Food',
        currentInstallment: 2,
        totalInstallments: 5,
        amount: 200,
        remainingAmount: 600,
        monthsLeft: 3,
      },
    ])
  })

  it('never returns a negative date countdown', () => {
    expect(daysUntil(Date.UTC(2026, 7, 1), new Date(Date.UTC(2026, 8, 2)))).toBe(0)
  })

  it('lets an explicit recurrence label decide what is an instalment, not the description text', () => {
    const rows = [
      entry({ description: 'Loja 2/6', amount: 100, recurrence: 'installment' }),
      entry({ description: 'Aluguel 1/12', amount: 200, recurrence: 'recurring' }),
      entry({ description: 'Curso 1/4', amount: 50, recurrence: 'oneOff' }),
      entry({ description: 'Mercado 3/9', amount: 60, recurrence: 'undecided' }),
    ]

    // Ordered by the amount still owed: Loja has 4 x 100 left, Mercado 6 x 60.
    expect(openInstallments(rows).map((installment) => installment.description)).toEqual(['Loja 2/6', 'Mercado 3/9'])
  })
})
