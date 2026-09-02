import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { StatTile } from '@/components/dashboard/stat-tile'
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

function monthProgress(month: string, now: Date = new Date()): number {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = Date.UTC(year, monthNumber - 1, 1)
  const end = Date.UTC(year, monthNumber, 0)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (today < start) return 0
  if (today >= end) return 1
  return (today - start + 86_400_000) / (end - start + 86_400_000)
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
      tableIds: [],
      cardIds: [],
      categories: [],
    }),
    [month],
  )
  const entries = useDashboardEntries(filters)
  const previousFilters: DashboardFilters = useMemo(
    () => ({
      ...filters,
      customFrom: `${shiftMonth(month, -1)}-01`,
      customTo: lastDayOfMonth(shiftMonth(month, -1)),
    }),
    [filters, month],
  )
  const previousEntries = useDashboardEntries(previousFilters)
  const spendByCategory = useMemo(() => {
    const outgoing = entries.filter((e) => e.direction === 'out' && e.amount > 0)
    return new Map(groupByKey(outgoing, 'category', 'amount').map((g) => [g.label, g.value]))
  }, [entries])
  const previousSpendByCategory = useMemo(() => {
    const outgoing = previousEntries.filter((e) => e.direction === 'out' && e.amount > 0)
    return new Map(groupByKey(outgoing, 'category', 'amount').map((g) => [g.label, g.value]))
  }, [previousEntries])

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
        previousSpent: previousSpendByCategory.get(category.name) ?? 0,
      }
    })
    .filter((row) => row.budgetAmount > 0 || row.spent > 0 || row.previousSpent > 0)
    .sort((a, b) => {
      const aOvershoot = a.budgetAmount > 0 ? (a.spent - a.budgetAmount) / a.budgetAmount : a.spent > 0 ? Infinity : -Infinity
      const bOvershoot = b.budgetAmount > 0 ? (b.spent - b.budgetAmount) / b.budgetAmount : b.spent > 0 ? Infinity : -Infinity
      return bOvershoot - aOvershoot || b.spent - a.spent
    })

  const totalBudget = rows.reduce((total, row) => total + row.budgetAmount, 0)
  const totalSpent = rows.reduce((total, row) => total + row.spent, 0)
  const remaining = totalBudget - totalSpent
  const elapsed = monthProgress(month)
  const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const elapsedPercent = elapsed * 100
  const projectedSpend = elapsed > 0 ? totalSpent / elapsed : 0
  const showPreviousOutcome = totalSpent === 0 && rows.some((row) => row.previousSpent > 0)
  const bulletMax = Math.max(...rows.map((row) => Math.max(row.budgetAmount, showPreviousOutcome ? row.previousSpent : row.spent)), 1)

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
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('finances:budget.previousMonth')} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-32 text-center text-sm">{monthLabel(month)}</span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('finances:budget.nextMonth')} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <span className="text-muted-foreground text-xs">{t('finances:budget.monthElapsed', { percent: elapsedPercent.toFixed(0) })}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t('finances:budget.budgeted')} value={currency.format(totalBudget)} indicatorColor="var(--brand)" />
            <StatTile label={t('finances:budget.spent')} value={currency.format(totalSpent)} indicatorColor="var(--brand)" />
            <StatTile label={t('finances:budget.remaining')} value={currency.format(remaining)} indicatorColor={remaining < 0 ? 'var(--destructive)' : 'var(--brand)'} />
            <StatTile
              label={t('finances:budget.pace')}
              value={`${spentPercent.toFixed(0)}%`}
              tone={spentPercent > elapsedPercent ? 'negative' : 'positive'}
              indicatorColor={spentPercent > elapsedPercent ? 'var(--destructive)' : 'var(--brand)'}
              delta={{ value: (spentPercent - elapsedPercent) / 100, goodDirection: 'down', label: t('finances:budget.vsElapsed') }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard
              title={t('finances:budget.budgetVsSpent')}
              className="h-[340px] lg:col-span-2"
              bodyClassName="overflow-auto p-0"
              footnote={showPreviousOutcome ? t('finances:budget.previousOutcome') : undefined}
            >
              {rows.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:budget.noRows')}</p>
              ) : (
                <div className="divide-y">
                  {rows.map((row) => {
                    const displayedSpent = showPreviousOutcome ? row.previousSpent : row.spent
                    const over = row.budgetAmount > 0 && displayedSpent > row.budgetAmount
                    return (
                      <div key={row.categoryId} className="flex flex-col gap-1.5 p-3">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate font-medium">{row.name}</span>
                          <span className={cn('shrink-0 tabular-nums', over && 'text-destructive font-medium')}>
                            {currency.format(displayedSpent)} / {currency.format(row.budgetAmount)}
                          </span>
                        </div>
                        <div className="bg-muted relative h-2 overflow-hidden rounded-full">
                          <div
                            className={cn('h-full rounded-full', showPreviousOutcome ? 'bg-muted-foreground/40' : over ? 'bg-destructive' : 'bg-primary')}
                            style={{ width: `${(displayedSpent / bulletMax) * 100}%` }}
                          />
                          {row.budgetAmount > 0 && (
                            <span className="bg-foreground absolute inset-y-0 w-px" style={{ left: `${(row.budgetAmount / bulletMax) * 100}%` }} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:budget.monthProjection')} className="h-[340px]">
              <div className="flex h-full flex-col justify-center gap-5">
                <ProjectionBar label={t('finances:budget.spent')} value={totalSpent} max={Math.max(totalBudget, projectedSpend, totalSpent, 1)} className="bg-primary" />
                <ProjectionBar label={t('finances:budget.projected')} value={projectedSpend} max={Math.max(totalBudget, projectedSpend, totalSpent, 1)} className="bg-destructive" />
                <ProjectionBar label={t('finances:budget.budgeted')} value={totalBudget} max={Math.max(totalBudget, projectedSpend, totalSpent, 1)} className="bg-muted-foreground" />
              </div>
            </DashboardCard>
          </div>

          <DashboardCard title={t('finances:budget.setTargets')} className="h-[300px]" bodyClassName="overflow-auto p-0">
            {rows.length === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:budget.noRows')}</p>
            ) : (
              <div className="divide-y">
                {rows.map((row) => {
                  const hasBudget = row.budgetAmount > 0
                  return (
                    <div key={row.categoryId} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">{t('finances:budget.spent')}: {currency.format(row.spent)}</p>
                      </div>
                      <Input
                        type="number"
                        value={drafts[row.categoryId] ?? (hasBudget ? String(row.budgetAmount) : '')}
                        placeholder={t('finances:budget.setBudget')}
                        className="h-8 w-28 text-xs"
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.categoryId]: e.target.value }))}
                        onBlur={(e) => e.target.value && void saveBudget(row.categoryId, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void saveBudget(row.categoryId, (e.target as HTMLInputElement).value)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}

function ProjectionBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{currency.format(value)}</span>
      </div>
      <div className="bg-muted h-3 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  )
}
