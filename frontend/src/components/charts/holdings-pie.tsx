import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey, type ThemedColor } from './chart-colors'

export interface HoldingsRing {
  key: string
  label: string
  value: number
  color: ThemedColor
  /** What the slice is made of — drawn as the outer ring, in tints of the slice's colour. */
  children: { key: string; label: string; value: number }[]
}

interface HoldingsPieProps {
  groups: HoldingsRing[]
  valueFormatter: (value: number) => string
  emptyLabel: string
}

/** Recharts hands a label renderer the slice's geometry and its datum. */
interface LabelProps {
  cx: number
  cy: number
  midAngle: number
  outerRadius: number
  percent: number
  payload: { label?: string; fillKey?: string }
}

const RADIAN = Math.PI / 180
/** Below this a slice's own label would collide with its neighbours; the tooltip has it. */
const LABEL_FLOOR = 0.06

/**
 * What is held, in two rings: the classes inside, what each is made of outside.
 *
 * The inner ring answers the question — how much is in cash, in fixed income, in variable
 * income — and the outer one answers the follow-up without a second chart, each fund or
 * paper drawn inside the arc of the class it belongs to and tinted from the same colour,
 * so the grouping is visible before any label is read.
 *
 * The names sit outside on leader lines rather than in a legend: a legend makes the eye
 * carry a colour across the card and back, while a line just points. Slices too thin to
 * label are left to the tooltip rather than crowded into unreadable text.
 */
export function HoldingsPie({ groups, valueFormatter, emptyLabel }: HoldingsPieProps) {
  const held = groups.filter((group) => group.value > 0)
  if (held.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const inner = held.map((group) => ({ ...group, fillKey: chartSafeKey(group.key) }))
  const outer = held.flatMap((group) =>
    group.children.map((child, index) => ({
      ...child,
      // Each child is the parent's colour, stepped paler the further down the ranking it
      // sits — a family resemblance rather than a new hue per fund.
      fillKey: chartSafeKey(`${group.key}-${index}`),
      tint: index,
      parent: group,
    })),
  )

  const config: ChartConfig = Object.fromEntries([
    ...inner.map((group) => [group.fillKey, { label: group.label, theme: group.color }]),
    ...outer.map((child) => [
      child.fillKey,
      { label: child.label, theme: tinted(child.parent.color, child.tint) },
    ]),
  ])

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <PieChart margin={{ top: 8, right: 68, bottom: 8, left: 68 }}>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="fillKey" />} />
        <Pie data={inner} dataKey="value" nameKey="fillKey" outerRadius="52%" strokeWidth={1} isAnimationActive={false}>
          {inner.map((group) => (
            <Cell key={group.key} fill={`var(--color-${group.fillKey})`} />
          ))}
        </Pie>
        <Pie
          data={outer}
          dataKey="value"
          nameKey="fillKey"
          innerRadius="56%"
          outerRadius="76%"
          strokeWidth={1}
          isAnimationActive={false}
          labelLine={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
          label={SliceLabel}
        >
          {outer.map((child) => (
            <Cell key={child.key} fill={`var(--color-${child.fillKey})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )

  function SliceLabel(props: unknown) {
    const { cx, cy, midAngle, outerRadius, percent, payload } = props as LabelProps
    if (percent < LABEL_FLOOR) return null

    const radius = outerRadius + 14
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const onTheRight = x >= cx

    return (
      <text x={x} y={y} textAnchor={onTheRight ? 'start' : 'end'} dominantBaseline="central" className="fill-foreground" fontSize={10}>
        <tspan x={x} dy="-0.4em">{payload.label}</tspan>
        <tspan x={x} dy="1.15em" className="fill-muted-foreground">{valueFormatter(valueOf(payload))}</tspan>
      </text>
    )
  }

  function valueOf(payload: { fillKey?: string }): number {
    return outer.find((child) => child.fillKey === payload.fillKey)?.value ?? 0
  }
}

/** The same hue, lightened a step per rank, so a class reads as one family of slices. */
function tinted(color: ThemedColor, step: number): ThemedColor {
  if (step === 0) return color
  const mix = Math.min(0.55, step * 0.22)
  return {
    light: `color-mix(in oklab, ${color.light} ${Math.round((1 - mix) * 100)}%, white)`,
    dark: `color-mix(in oklab, ${color.dark} ${Math.round((1 - mix) * 100)}%, black)`,
  }
}
