import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey } from './chart-colors'
import type { ThemedColor } from './chart-colors'

export interface PieSlice {
  key: string
  label: string
  value: number
  color: ThemedColor
}

interface AppPieChartProps {
  data: PieSlice[]
}

export function AppPieChart({ data }: AppPieChartProps) {
  // Two keys per slice, same reasoning as line-chart.tsx: chartSafeKey(d.key) is what
  // the Cell's fill below actually references, but `nameKey="key"` makes
  // ChartLegendContent/ChartTooltipContent resolve a slice's label via
  // `config[d.key]` (the raw value, read straight off the data) — and the legend has
  // no fallback if that key is missing. The raw-keyed entry exists purely for that
  // lookup; its own CSS declaration (invalid whenever d.key isn't a bare identifier)
  // is never the one actually applied to anything.
  const config: ChartConfig = Object.fromEntries(
    data.flatMap((d) => {
      const entry = { label: d.label, theme: { light: d.color.light, dark: d.color.dark } } as const
      const safeKey = chartSafeKey(d.key)
      return safeKey === d.key ? [[safeKey, entry]] : [[safeKey, entry], [d.key, entry]]
    }),
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={0} outerRadius="80%" strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${chartSafeKey(d.key)})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  )
}
