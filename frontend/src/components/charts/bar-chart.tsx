import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey } from './chart-colors'
import type { ChartSeries } from './line-chart'

interface AppBarChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  /** One bar, or several stacked into the whole they add up to. */
  series: ChartSeries | ChartSeries[]
  /** Stacks several series into one bar: composition and total in one shape. */
  stacked?: boolean
  xFormatter?: (value: string | number) => string
  /** A same-axis benchmark such as a monthly average — deliberately not another series. */
  referenceValue?: number
  /** Used consistently by the axis and tooltip when the values are amounts. */
  valueFormatter?: (value: number) => string
}

export function AppBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  stacked,
  xFormatter,
  referenceValue,
  valueFormatter,
}: AppBarChartProps<T>) {
  // See chartSafeKey's docstring — the config/CSS-var key is sanitized; series.key
  // itself stays the real dataKey recharts reads off each row.
  const bars = Array.isArray(series) ? series : [series]
  const config: ChartConfig = Object.fromEntries(bars.map((bar) => [
    chartSafeKey(bar.key),
    { label: bar.label, theme: { light: bar.color.light, dark: bar.color.dark } },
  ]))

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => valueFormatter?.(value) ?? String(value)} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [valueFormatter?.(value as number) ?? String(value), name]}
            />
          }
        />
        {referenceValue !== undefined && (
          <ReferenceLine y={referenceValue} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        )}
        {bars.map((bar, index) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label}
            // Stacked: one bar is the whole, and its bands are what the whole is made of.
            // Only the topmost band is rounded, or a stack reads as a pile of lozenges.
            stackId={stacked ? 'stack' : undefined}
            fill={`var(--color-${chartSafeKey(bar.key)})`}
            radius={!stacked || index === bars.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
