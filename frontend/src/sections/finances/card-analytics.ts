import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import type { Card } from '@/lib/model/types'

const DAY_MS = 86_400_000

export interface InvoiceCycle {
  from: number
  to: number
  closingDate: number
  dueDate?: number
}

export interface OpenInstallment {
  description: string
  category: string
  currentInstallment: number
  totalInstallments: number
  amount: number
  remainingAmount: number
  monthsLeft: number
}

function dateAtDay(year: number, month: number, day: number): number {
  const finalDay = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return Date.UTC(year, month, finalDay)
}

/** The currently open invoice cycle, respecting the card’s configured closing and due days. */
export function currentInvoiceCycle(card: Card, now: Date = new Date()): InvoiceCycle {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const closingDay = card.closingDay ?? 1
  const thisClosing = dateAtDay(now.getUTCFullYear(), now.getUTCMonth(), closingDay)
  const closingDate = today <= thisClosing ? thisClosing : dateAtDay(now.getUTCFullYear(), now.getUTCMonth() + 1, closingDay)
  const previousClosing = dateAtDay(new Date(closingDate).getUTCFullYear(), new Date(closingDate).getUTCMonth() - 1, closingDay)

  let dueDate: number | undefined
  if (card.dueDay) {
    const closing = new Date(closingDate)
    dueDate = dateAtDay(closing.getUTCFullYear(), closing.getUTCMonth() + (card.dueDay < closingDay ? 1 : 0), card.dueDay)
  }

  return { from: previousClosing + DAY_MS, to: closingDate, closingDate, dueDate }
}

export function entriesInInvoice(rows: FilteredEntry[], cycle: InvoiceCycle): FilteredEntry[] {
  return rows.filter((row) => row.date >= cycle.from && row.date <= cycle.to && row.amount > 0)
}

/**
 * The recurrence label decides *whether* a row is an instalment; the "2/3" or
 * "Parcela 2/3" notation is then read only to find how far along it is. A row the
 * user explicitly called one-off or recurring is never re-guessed from its text.
 */
export function openInstallments(rows: FilteredEntry[]): OpenInstallment[] {
  return rows
    .filter((row) => row.recurrence === 'installment' || row.recurrence === 'undecided' || row.recurrence === undefined)
    .map((row) => {
      const match = row.description.match(/(?:parcela\s*)?(\d{1,2})\s*\/\s*(\d{1,2})/i)
      if (!match) return null
      const currentInstallment = Number(match[1])
      const totalInstallments = Number(match[2])
      if (currentInstallment < 1 || totalInstallments <= currentInstallment) return null
      const monthsLeft = totalInstallments - currentInstallment
      return {
        description: row.description,
        category: row.category,
        currentInstallment,
        totalInstallments,
        amount: row.amount,
        remainingAmount: row.amount * monthsLeft,
        monthsLeft,
      }
    })
    .filter((row): row is OpenInstallment => row !== null)
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
}

export function daysUntil(date: number, now: Date = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(0, Math.ceil((date - today) / DAY_MS))
}
