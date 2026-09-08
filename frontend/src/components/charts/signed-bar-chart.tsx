import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { ThemedColor } from './chart-colors'

interface SignedBarChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  /** One signed number per row: above the line when positive, below when not. */
  valueKey: Extract<keyof T, string>
  upLabel: string
  downLabel: string
  upColor: ThemedColor
  downColor: ThemedColor
  valueFormatter?: (value: number) => string
}

/**
 * One column per row, coloured by which way it went.
 *
 * The alternative — two series, one for the rise and one for the fall — gives every row
 * two slots and leaves one of them empty, which reads as a chart with half its bars
 * missing and puts a "R$ 0,00 more spent" in every tooltip. A category moved one way or
 * the other; one bar says so.
 */
export function SignedBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  valueKey,
  upLabel,
  downLabel,
  upColor,
  downColor,
  valueFormatter,
}: SignedBarChartProps<T>) {
  const config: ChartConfig = {
    up: { label: upLabel, theme: upColor },
    down: { label: downLabel, theme: downColor },
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => valueFormatter?.(Math.abs(value)) ?? String(Math.abs(value))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [
                valueFormatter?.(Math.abs(value as number)) ?? String(value),
                ` ${(value as number) >= 0 ? upLabel : downLabel}`,
              ]}
            />
          }
        />
        <Bar dataKey={valueKey} radius={2}>
          {data.map((row, index) => (
            <Cell key={index} fill={(row[valueKey] as number) >= 0 ? 'var(--color-up)' : 'var(--color-down)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
