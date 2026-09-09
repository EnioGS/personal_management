import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DOMAIN_COLOR } from './chart-colors'

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
    cash: { label: cashLabel, theme: DOMAIN_COLOR.contributions },
    held: { label: heldLabel, theme: DOMAIN_COLOR.balance },
    fixedIncome: { label: fixedLabel, theme: DOMAIN_COLOR.fixedIncome },
    variableIncome: { label: variableLabel, theme: DOMAIN_COLOR.variableIncome },
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
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
        <ChartLegend content={<ChartLegendContent />} />
        {/* Bars first, so the lines are drawn over them rather than behind. */}
        <Bar dataKey="received" name={receivedLabel} fill="var(--color-received)" radius={2} maxBarSize={14} />
        <Bar dataKey="cash" name={cashLabel} fill="var(--color-cash)" radius={2} maxBarSize={14} />
        <Line dataKey="held" name={heldLabel} type="linear" stroke="var(--color-held)" strokeWidth={2} dot={dot('held')} />
        <Line dataKey="fixedIncome" name={fixedLabel} type="linear" stroke="var(--color-fixedIncome)" strokeWidth={2} dot={dot('fixedIncome')} />
        <Line dataKey="variableIncome" name={variableLabel} type="linear" stroke="var(--color-variableIncome)" strokeWidth={2} dot={dot('variableIncome')} />
      </ComposedChart>
    </ChartContainer>
  )
}
