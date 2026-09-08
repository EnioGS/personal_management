import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { CSSProperties } from 'react'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { extentOf } from '@/lib/dashboard/axis-domains'
import { DIVERGING_PAIR, DOMAIN_COLOR, type ThemedColor } from './chart-colors'

interface CapitalEvolutionChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  xFormatter: (value: string | number) => string
  valueFormatter: (value: number) => string
  capitalLabel: string
  spendingLabel: string
  investmentsLabel: string
  netCashFlowLabel: string
  incomeLabel: string
}

/**
 * Small enough to be a mark rather than a marker: it says a month was measured here, and
 * gets out of the way of the line it sits on. No outline, and the line's own colour, so it
 * reads as a thickening of the line rather than as something sitting on top of it.
 */
const dot = (series: string) => ({ r: 1.6, strokeWidth: 0, fill: `var(--color-${series})` })

/**
 * One chart for the whole story: what a month moved, and what it added up to.
 *
 * Three bars around the zero line — what arrived, what the month netted, what left — under
 * two running lines for capital and for what is held. They were two charts, stacked, and
 * the eye had to carry a month from one to the other to ask the only interesting question:
 * whether a good month showed up in the total. On one pair of axes it is simply there.
 *
 * Spending is negated so it hangs below the line and the tooltip gives the magnitude back.
 * Income wears violet rather than green because the capital line is already green, and two
 * greens on one chart read as one quantity drawn twice.
 *
 * The lines are drawn straight from month to month. A monotone curve invents a shape
 * between two measurements — a smooth rise through a month nothing was measured in — and
 * on a chart whose whole subject is what happened in each month, that is a claim the data
 * does not make. The dots say where the measurements actually are.
 */
export function CapitalEvolutionChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  valueFormatter,
  capitalLabel,
  spendingLabel,
  investmentsLabel,
  netCashFlowLabel,
  incomeLabel,
}: CapitalEvolutionChartProps<T>) {
  // One line for what is held, not two: fixed and variable were a distinction about the
  // holdings, not about the capital they add up to, and drawing them apart here made the
  // chart argue with the tile above it.
  const config: ChartConfig = {
    capital: { label: capitalLabel, theme: DOMAIN_COLOR.balance },
    // One line for what is held, not two: fixed and variable were a distinction about the
    // holdings, not about the capital they add up to.
    investments: { label: investmentsLabel, theme: DOMAIN_COLOR.variableIncome },
    arrived: { label: incomeLabel, theme: DOMAIN_COLOR.income },
    income: { label: netCashFlowLabel, theme: DOMAIN_COLOR.cashFlow },
    spending: { label: spendingLabel, theme: DIVERGING_PAIR.negative },
  }

  // Hung below the zero line rather than drawn as a positive quantity, so a month reads at
  // a glance; the axis and the tooltip give the magnitude back.
  const chartData = data.map((row) => ({ ...row, spending: -(row.spending as number) }))

  // One scale for everything, running from the lowest bar to the highest line rather than
  // to whichever of them is further from zero. The flows never fall as far as the totals
  // rise, so a domain mirrored about zero would leave the space below empty and squeeze
  // everything above into what was left.
  const extent = extentOf(chartData, ['capital', 'investments', 'arrived', 'income', 'spending'])

  // The chart's own legend lists the series in an order of its choosing, which mixes the
  // bars in among the lines; these are two different kinds of statement — what a month
  // did, and what it came to — and sorting them apart by eye every time is a small tax on
  // every reading. Drawn here instead, grouped, bars in the order they sit around zero.
  const legend: { label: string; color: ThemedColor; kind: 'bar' | 'line' }[] = [
    { label: incomeLabel, color: DOMAIN_COLOR.income, kind: 'bar' },
    { label: netCashFlowLabel, color: DOMAIN_COLOR.cashFlow, kind: 'bar' },
    { label: spendingLabel, color: DIVERGING_PAIR.negative, kind: 'bar' },
    { label: capitalLabel, color: DOMAIN_COLOR.balance, kind: 'line' },
    { label: investmentsLabel, color: DOMAIN_COLOR.variableIncome, kind: 'line' },
  ]

  return (
    <div className="flex h-full flex-col">
    <ChartContainer config={config} className="aspect-auto min-h-0 w-full flex-1">
      <ComposedChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[extent.min, extent.max]}
          tickFormatter={(value: number) => valueFormatter(Math.abs(value))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value, name) => [valueFormatter(name === 'spending' ? Math.abs(value as number) : (value as number)), name]} />
          }
        />
        <Bar dataKey="arrived" name={incomeLabel} fill="var(--color-arrived)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="income" name={netCashFlowLabel} fill="var(--color-income)" radius={2} />
        <Bar dataKey="spending" name={spendingLabel} fill="var(--color-spending)" radius={[0, 0, 3, 3]} />
        <Line dataKey="capital" name={capitalLabel} type="linear" stroke="var(--color-capital)" strokeWidth={2} dot={dot('capital')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="investments" name={investmentsLabel} type="linear" stroke="var(--color-investments)" strokeWidth={2} dot={dot('investments')} activeDot={{ r: 4, strokeWidth: 0 }} />

      </ComposedChart>
    </ChartContainer>

    <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs">
      {legend.map((entry, index) => (
        <span
          key={entry.label}
          // A gap where the kinds change, so the grouping is visible without a heading.
          className={cn('entity flex items-center gap-1.5', index === 3 && 'ml-3 border-l pl-4')}
          style={{ '--entity-light': entry.color.light, '--entity-dark': entry.color.dark } as CSSProperties}
        >
          <span className={cn('entity-fill shrink-0', entry.kind === 'bar' ? 'size-2 rounded-[2px]' : 'h-0.5 w-3.5 rounded-full')} />
          {entry.label}
        </span>
      ))}
    </div>
    </div>
  )
}

