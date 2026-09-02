import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import type { DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { groupByKey } from '@/lib/aggregations'
import { useBudgetsStore, useCategoriesStore } from '@/lib/model/model-stores'
import { cn } from '@/lib/utils'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01`),
  )
  // Capitalize only the first letter — "setembro de 2026" -> "Setembro de 2026".
  // CSS `capitalize` would title-case every word, including the "de" connector.
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, m, 0))
  return last.toISOString().slice(0, 10)
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** A monthly spending target per category, compared against what was actually spent. */
export function BudgetPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const categories = useCategoriesStore((s) => s.items)
  const budgets = useBudgetsStore((s) => s.items)
  const addBudget = useBudgetsStore((s) => s.addItem)
  const updateBudget = useBudgetsStore((s) => s.updateItem)
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  const filters: DashboardFilters = useMemo(
    () => ({
      preset: 'custom',
      customFrom: `${month}-01`,
      customTo: lastDayOfMonth(month),
      accountIds: [],
      cardIds: [],
      categories: [],
    }),
    [month],
  )
  const entries = useDashboardEntries(filters)
  const spendByCategory = useMemo(() => {
    const outgoing = entries.filter((e) => e.direction === 'out')
    return new Map(groupByKey(outgoing, 'category', 'amount').map((g) => [g.label, g.value]))
  }, [entries])

  // Every category with either a budget or actual spend this month — a category with
  // neither is just noise on a budget screen.
  const rows = categories
    .map((category) => {
      const budget = budgets.find((b) => b.categoryId === category.id)
      return {
        categoryId: category.id,
        name: category.name,
        budgetAmount: budget?.monthlyAmount ?? 0,
        spent: spendByCategory.get(category.name) ?? 0,
      }
    })
    .filter((row) => row.budgetAmount > 0 || row.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  async function saveBudget(categoryId: number, value: string) {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) return
    const existing = budgets.find((b) => b.categoryId === categoryId)
    if (existing) await updateBudget(existing.id, { categoryId, monthlyAmount: amount })
    else await addBudget({ categoryId, monthlyAmount: amount })
    setDrafts((d) => {
      const next = { ...d }
      delete next[categoryId]
      return next
    })
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('finances:items.budget')}</h2>
          <p className="text-muted-foreground text-xs">{t('finances:budget.description')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('finances:budget.previousMonth')} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-32 text-center text-sm">{monthLabel(month)}</span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('finances:budget.nextMonth')} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('finances:budget.noRows')}</p>
      ) : (
        <div className="flex flex-col divide-y overflow-auto rounded-md border">
          {rows.map((row) => {
            const hasBudget = row.budgetAmount > 0
            const percent = hasBudget ? Math.min(100, (row.spent / row.budgetAmount) * 100) : 0
            const over = hasBudget && row.spent > row.budgetAmount
            return (
              <div key={row.categoryId} className="flex flex-col gap-1.5 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{row.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-xs', over && 'text-destructive font-medium')}>{currency.format(row.spent)}</span>
                    <span className="text-muted-foreground text-xs">/</span>
                    <Input
                      type="number"
                      value={drafts[row.categoryId] ?? (hasBudget ? String(row.budgetAmount) : '')}
                      placeholder={t('finances:budget.setBudget')}
                      className="h-7 w-24 text-xs"
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.categoryId]: e.target.value }))}
                      onBlur={(e) => e.target.value && void saveBudget(row.categoryId, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void saveBudget(row.categoryId, (e.target as HTMLInputElement).value)}
                    />
                  </div>
                </div>
                {hasBudget && (
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
