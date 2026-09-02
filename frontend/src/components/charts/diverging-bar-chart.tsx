import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DIVERGING_PAIR } from './chart-colors'

interface DivergingBarChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  /** Positive values — rendered above the zero baseline. */
  positiveKey: Extract<keyof T, string>
  /** Non-negative values — negated internally so they render below the baseline. */
  negativeKey: Extract<keyof T, string>
  positiveLabel: string
  negativeLabel: string
  xFormatter?: (value: string | number) => string
  /** Formats a bar's absolute value for the tooltip (the sign is already shown by position). */
  valueFormatter?: (value: number) => string
}

/**
 * Money in vs. out, centered on zero — a genuine polarity (dataviz skill: "diverging"),
 * not two unrelated series sharing an axis. One axis, one zero baseline: `negativeKey`
 * is negated here so it renders as a real diverging bar rather than a second stacked
 * series, and the tooltip/axis show the original positive magnitude back.
 */
export function DivergingBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  positiveKey,
  negativeKey,
  positiveLabel,
  negativeLabel,
  xFormatter,
  valueFormatter,
}: DivergingBarChartProps<T>) {
  const chartData = data.map((row) => ({ ...row, [negativeKey]: -(row[negativeKey] as number) }))

  const config: ChartConfig = {
    [positiveKey]: { label: positiveLabel, theme: DIVERGING_PAIR.positive },
    [negativeKey]: { label: negativeLabel, theme: DIVERGING_PAIR.negative },
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (valueFormatter ? valueFormatter(Math.abs(v)) : String(Math.abs(v)))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                valueFormatter ? valueFormatter(Math.abs(value as number)) : String(Math.abs(value as number)),
                ` ${name === positiveKey ? positiveLabel : negativeLabel}`,
              ]}
            />
          }
        />
        <Bar dataKey={positiveKey} fill={`var(--color-${positiveKey})`} radius={[4, 4, 0, 0]} />
        <Bar dataKey={negativeKey} fill={`var(--color-${negativeKey})`} radius={[0, 0, 4, 4]} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  )
}
