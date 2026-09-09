import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import type { CSSProperties } from 'react'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { DOMAIN_COLOR, type ThemedColor } from './chart-colors'

interface HoldingsOverTimeChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  xFormatter: (value: string | number) => string
  valueFormatter: (value: number) => string
  heldLabel: string
  fixedLabel: string
  variableLabel: string
  receivedLabel: string
  cashLabel: string
  /** Which x values to label. Every third month, so a two-year view stays readable. */
  xTicks?: (string | number)[]
}

/** Small enough to say a month was measured here without sitting on top of the line. */
const dot = (series: string) => ({ r: 1.6, strokeWidth: 0, fill: `var(--color-${series})` })

/**
 * What is held, what it is held as, and what it paid — on one pair of axes.
 *
 * Levels are lines and events are bars, which is the distinction the stacked version could
 * not draw: a running total and a month's dividend are not the same kind of quantity, and
 * stacking them said they were. The three lines are the total and the two classes it is
 * mostly made of, so the gap between them is what is neither — visible without a fourth
 * line arguing for space. The bars are the two monthly figures worth seeing beside it:
 * what came in as income, and how much of the pot is sitting in cash.
 *
 * Straight segments rather than a curve: a monotone line invents a shape between two
 * measurements, and on a chart whose subject is what each month ended at, that is a claim
 * the data does not make.
 */
export function HoldingsOverTimeChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  valueFormatter,
  heldLabel,
  fixedLabel,
  variableLabel,
  receivedLabel,
  cashLabel,
  xTicks,
}: HoldingsOverTimeChartProps<T>) {
  const config: ChartConfig = {
    received: { label: receivedLabel, theme: DOMAIN_COLOR.dividends },
    cash: { label: cashLabel, theme: DOMAIN_COLOR.cashReserve },
    held: { label: heldLabel, theme: DOMAIN_COLOR.held },
    fixedIncome: { label: fixedLabel, theme: DOMAIN_COLOR.fixedIncome },
    variableIncome: { label: variableLabel, theme: DOMAIN_COLOR.variableIncome },
  }

  // Grouped by kind rather than by the order the chart happens to draw in: the bars say
  // what a month did and the lines say what it came to, and sorting the two apart by eye
  // is a tax on every reading. Same shape as the capital chart, for the same reason.
  const legend: { label: string; color: ThemedColor; kind: 'bar' | 'line' }[] = [
    { label: receivedLabel, color: DOMAIN_COLOR.dividends, kind: 'bar' },
    { label: cashLabel, color: DOMAIN_COLOR.cashReserve, kind: 'bar' },
    { label: heldLabel, color: DOMAIN_COLOR.held, kind: 'line' },
    { label: fixedLabel, color: DOMAIN_COLOR.fixedIncome, kind: 'line' },
    { label: variableLabel, color: DOMAIN_COLOR.variableIncome, kind: 'line' },
  ]

  return (
    <div className="flex h-full flex-col">
    <ChartContainer config={config} className="aspect-auto min-h-0 w-full flex-1">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={xFormatter}
          ticks={xTicks}
          interval={xTicks ? 0 : undefined}
        />
        <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(value: number) => valueFormatter(value)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [valueFormatter(value as number), name]} />} />
        <Line dataKey="held" name={heldLabel} type="linear" stroke="var(--color-held)" strokeWidth={2} dot={dot('held')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="fixedIncome" name={fixedLabel} type="linear" stroke="var(--color-fixedIncome)" strokeWidth={2} dot={dot('fixedIncome')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="variableIncome" name={variableLabel} type="linear" stroke="var(--color-variableIncome)" strokeWidth={2} dot={dot('variableIncome')} activeDot={{ r: 4, strokeWidth: 0 }} />
        {/* Drawn last so they sit over the lines, and translucent so the line a bar
            crosses is read through it rather than cut in two. */}
        <Bar dataKey="received" name={receivedLabel} fill="var(--color-received)" fillOpacity={0.55} radius={2} maxBarSize={14} />
        <Bar dataKey="cash" name={cashLabel} fill="var(--color-cash)" fillOpacity={0.55} radius={2} maxBarSize={14} />
      </ComposedChart>
    </ChartContainer>

    <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs">
      {legend.map((entry, index) => (
        <span
          key={entry.label}
          // A gap where the kinds change, so the grouping is visible without a heading.
          className={cn('entity flex items-center gap-1.5', index === 2 && 'ml-3 border-l pl-4')}
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
