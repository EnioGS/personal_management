import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey, type ThemedColor } from './chart-colors'

export interface ChartSeries {
  key: string
  label: string
  color: ThemedColor
}

interface AppLineChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  series: ChartSeries[]
  xFormatter?: (value: string | number) => string
  /** Used consistently by the axis and the tooltip when the values are amounts. */
  valueFormatter?: (value: number) => string
  /**
   * The x values to label, when labelling all of them would be unreadable. The line is
   * still drawn from every point — this thins the axis, not the data.
   */
  xTicks?: (string | number)[]
}

export function AppLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  xFormatter,
  valueFormatter,
  xTicks,
}: AppLineChartProps<T>) {
  // Every entry is keyed twice: once by chartSafeKey(s.key) — what ChartStyle actually
  // emits as `--color-<key>` and what `stroke` below references, since a raw key with
  // spaces makes both sides invalid CSS — and once by s.label, because
  // ChartLegendContent resolves a series' display text by looking up
  // `config[item.name]` with no fallback if that key is missing (unlike the tooltip,
  // which falls back to item.name itself). The label-keyed entry only exists for that
  // lookup; its own (possibly invalid) CSS declaration is simply never referenced.
  const config: ChartConfig = Object.fromEntries(
    series.flatMap((s) => {
      const entry = { label: s.label, theme: { light: s.color.light, dark: s.color.dark } } as const
      const safeKey = chartSafeKey(s.key)
      return safeKey === s.label ? [[safeKey, entry]] : [[safeKey, entry], [s.label, entry]]
    }),
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <LineChart data={data}>
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
        <YAxis
          tickLine={false}
          axisLine={false}
          width={valueFormatter ? 56 : 48}
          tickFormatter={valueFormatter ? (value: number) => valueFormatter(value) : undefined}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={valueFormatter ? (value, name) => [valueFormatter(value as number), name] : undefined}
            />
          }
        />
        {/* A legend of squares under a chart of lines makes the reader match a colour
            twice. Drawn as short strokes instead, in the mark's own shape. */}
        {series.length > 1 && (
          <ChartLegend
            verticalAlign="bottom"
            content={<ChartLegendContent className="[&>*>div:first-child]:h-0.5 [&>*>div:first-child]:w-3.5 [&>*>div:first-child]:rounded-full" />}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={`var(--color-${chartSafeKey(s.key)})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
