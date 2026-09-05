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
  payload: { label?: string; value?: number }
}

/** And a leader line the two ends it drew, so the same test can suppress both. */
interface LabelLineProps {
  points?: { x: number; y: number }[]
  percent: number
}

const RADIAN = Math.PI / 180
/** Below this a slice's own label would collide with its neighbours; the tooltip has it. */
const LABEL_FLOOR = 0.04

/**
 * What is held, in two rings: the classes outside, what each is made of inside.
 *
 * The outer ring is the answer — how much is in cash, in fixed income, in variable income
 * — and it is the only ring that speaks, each class named on a line pointing at its own
 * arc. A legend would make the eye carry a colour across the card and back; a line just
 * points.
 *
 * The inner ring is the follow-up, and it stays quiet: every fund or paper sits inside
 * the arc of the class it belongs to, tinted from the class's own colour, so the
 * composition is visible as shape and shade without a word of text. Hovering it says what
 * each one is. Naming them too would be four labels for two facts, and on a card this
 * size they would collide before they explained anything.
 */
export function HoldingsPie({ groups, valueFormatter, emptyLabel }: HoldingsPieProps) {
  const held = groups.filter((group) => group.value > 0)
  if (held.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const classes = held.map((group) => ({ ...group, fillKey: chartSafeKey(group.key) }))
  const parts = held.flatMap((group) =>
    group.children.map((child, index) => ({
      ...child,
      // Each part is the parent's colour, stepped paler the further down the ranking it
      // sits — a family resemblance rather than a new hue per fund.
      fillKey: chartSafeKey(`${group.key}-${index}`),
      tint: index,
      parent: group,
    })),
  )

  const config: ChartConfig = Object.fromEntries([
    ...classes.map((group) => [group.fillKey, { label: group.label, theme: group.color }]),
    ...parts.map((child) => [
      child.fillKey,
      { label: child.label, theme: tinted(child.parent.color, child.tint) },
    ]),
  ])

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <PieChart margin={{ top: 10, right: 76, bottom: 10, left: 76 }}>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="fillKey" />} />
        {/* Inside: what each class is made of, aligned under the arc it belongs to. */}
        <Pie data={parts} dataKey="value" nameKey="fillKey" outerRadius="54%" strokeWidth={1} isAnimationActive={false}>
          {parts.map((child) => (
            <Cell key={child.key} fill={`var(--color-${child.fillKey})`} />
          ))}
        </Pie>
        {/* Outside: the classes, and the only ring that carries names. */}
        <Pie
          data={classes}
          dataKey="value"
          nameKey="fillKey"
          innerRadius="58%"
          outerRadius="78%"
          strokeWidth={1}
          isAnimationActive={false}
          labelLine={LeaderLine}
          label={SliceLabel}
        >
          {classes.map((group) => (
            <Cell key={group.key} fill={`var(--color-${group.fillKey})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )

  /** Drawn only where a label was: recharts would otherwise leave a line pointing at nothing. */
  function LeaderLine(props: unknown) {
    const { points, percent } = props as LabelLineProps
    if (percent < LABEL_FLOOR || !points || points.length < 2) return <g />
    return (
      <polyline
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1}
      />
    )
  }

  function SliceLabel(props: unknown) {
    const { cx, cy, midAngle, outerRadius, percent, payload } = props as LabelProps
    if (percent < LABEL_FLOOR) return null

    const radius = outerRadius + 12
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const onTheRight = x >= cx

    return (
      <text x={x} y={y} textAnchor={onTheRight ? 'start' : 'end'} dominantBaseline="central" className="fill-foreground" fontSize={11}>
        <tspan x={x} dy="-0.4em">{payload.label}</tspan>
        <tspan x={x} dy="1.2em" className="fill-muted-foreground">{valueFormatter(payload.value ?? 0)}</tspan>
      </text>
    )
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
