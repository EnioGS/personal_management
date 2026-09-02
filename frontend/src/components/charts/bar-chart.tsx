import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey } from './chart-colors'
import type { ChartSeries } from './line-chart'

interface AppBarChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  series: ChartSeries
  xFormatter?: (value: string | number) => string
}

export function AppBarChart<T extends Record<string, unknown>>({ data, xKey, series, xFormatter }: AppBarChartProps<T>) {
  // See chartSafeKey's docstring — the config/CSS-var key is sanitized; series.key
  // itself stays the real dataKey recharts reads off each row.
  const safeKey = chartSafeKey(series.key)
  const config: ChartConfig = {
    [safeKey]: { label: series.label, theme: { light: series.color.light, dark: series.color.dark } },
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey={series.key} name={series.label} fill={`var(--color-${safeKey})`} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
