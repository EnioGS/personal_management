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
  netCashFlowLabel: string
}

/**
 * Small enough to be a mark rather than a marker: it says a month was measured here, and
 * gets out of the way of the line it sits on. No outline, and the line's own colour, so it
 * reads as a thickening of the line rather than as something sitting on top of it.
 */
const dot = (series: string) => ({ r: 1.6, strokeWidth: 0, fill: `var(--color-${series})` })

/**
 * Capital, what is held and what each month netted, as lines, over the month's spending as
 * bars.
 *
 * The lines are drawn straight from month to month. A monotone curve invents a shape
 * between two measurements — a smooth rise through a month nothing was measured in — and
 * on a chart whose whole subject is what happened in each month, that is a claim the data
 * does not make. The dots say where the measurements actually are.
 */
export function CapitalEvolutionChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  valueFormatter,
  capitalLabel,
  spendingLabel,
  investmentsLabel,
  netCashFlowLabel,
}: CapitalEvolutionChartProps<T>) {
  // One line for what is held, not two: fixed and variable were a distinction about the
  // holdings, not about the capital they add up to, and drawing them apart here made the
  // chart argue with the tile above it.
  const config: ChartConfig = {
    capital: { label: capitalLabel, theme: DOMAIN_COLOR.balance },
    spending: { label: spendingLabel, theme: DIVERGING_PAIR.negative },
    investments: { label: investmentsLabel, theme: DOMAIN_COLOR.variableIncome },
    // The month's own net, drawn against the totals it accumulates into: the same
    // quantity as the cash flow chart's middle bar, and the same colour.
    income: { label: netCashFlowLabel, theme: DOMAIN_COLOR.cashFlow },
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
        <Line dataKey="capital" name={capitalLabel} type="linear" stroke="var(--color-capital)" strokeWidth={2} dot={dot('capital')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="investments" name={investmentsLabel} type="linear" stroke="var(--color-investments)" strokeWidth={2} dot={dot('investments')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="income" name={netCashFlowLabel} type="linear" stroke="var(--color-income)" strokeWidth={2} dot={dot('income')} activeDot={{ r: 4, strokeWidth: 0 }} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}
