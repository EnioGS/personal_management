import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { ThemedColor } from './chart-colors'

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
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, theme: { light: s.color.light, dark: s.color.dark } }]),
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
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
