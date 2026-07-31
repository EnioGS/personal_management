import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
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
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.key, { label: d.label, theme: { light: d.color.light, dark: d.color.dark } }]),
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={0} outerRadius="80%" strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  )
}
