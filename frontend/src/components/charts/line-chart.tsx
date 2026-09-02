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
}

export function AppLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  xFormatter,
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
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
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
