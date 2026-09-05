import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DIVERGING_PAIR, DOMAIN_COLOR } from './chart-colors'

interface CapitalEvolutionChartProps<T extends Record<string, unknown>> {
  data: T[]
  xKey: Extract<keyof T, string>
  xFormatter: (value: string | number) => string
  valueFormatter: (value: number) => string
  capitalLabel: string
  spendingLabel: string
  investmentsLabel: string
}

/** Capital and what is held, as lines, with the month's spending as bars on the same scale. */
export function CapitalEvolutionChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  valueFormatter,
  capitalLabel,
  spendingLabel,
  investmentsLabel,
}: CapitalEvolutionChartProps<T>) {
  // One line for what is held, not two: fixed and variable were a distinction about the
  // holdings, not about the capital they add up to, and drawing them apart here made the
  // chart argue with the tile above it.
  const config: ChartConfig = {
    capital: { label: capitalLabel, theme: DOMAIN_COLOR.balance },
    spending: { label: spendingLabel, theme: DIVERGING_PAIR.negative },
    investments: { label: investmentsLabel, theme: DOMAIN_COLOR.variableIncome },
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={valueFormatter} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value, name) => [valueFormatter(value as number), name]} />}
        />
        <Bar dataKey="spending" name={spendingLabel} fill="var(--color-spending)" barSize="33.3%" radius={[4, 4, 0, 0]} />
        <Line dataKey="capital" name={capitalLabel} type="monotone" stroke="var(--color-capital)" strokeWidth={2} dot={false} />
        <Line dataKey="investments" name={investmentsLabel} type="monotone" stroke="var(--color-investments)" strokeWidth={2} dot={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}
