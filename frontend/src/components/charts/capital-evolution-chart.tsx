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
  variableIncomeLabel: string
  fixedIncomeLabel: string
}

/** Capital closing value as a line, with same-scale credit-card spending bars beneath it. */
export function CapitalEvolutionChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  valueFormatter,
  capitalLabel,
  spendingLabel,
  variableIncomeLabel,
  fixedIncomeLabel,
}: CapitalEvolutionChartProps<T>) {
  const config: ChartConfig = {
    capital: { label: capitalLabel, theme: DOMAIN_COLOR.balance },
    spending: { label: spendingLabel, theme: DIVERGING_PAIR.negative },
    variableIncome: { label: variableIncomeLabel, theme: DOMAIN_COLOR.variableIncome },
    fixedIncome: { label: fixedIncomeLabel, theme: DOMAIN_COLOR.fixedIncome },
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
        <Line dataKey="variableIncome" name={variableIncomeLabel} type="monotone" stroke="var(--color-variableIncome)" strokeWidth={2} dot={false} />
        <Line dataKey="fixedIncome" name={fixedIncomeLabel} type="monotone" stroke="var(--color-fixedIncome)" strokeWidth={2} dot={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}
