import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { chartSafeKey, tintedColor, type ThemedColor } from './chart-colors'

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
 *
 * Both rings are cut into separate pieces rather than drawn as continuous bands. A gap
 * between slices is what makes a ring read as several things instead of one striped
 * thing, and it does the work a dividing stroke used to do without borrowing the card's
 * colour to do it.
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
      { label: child.label, theme: tintedColor(child.parent.color, child.tint) },
    ]),
  ])

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <PieChart margin={{ top: 12, right: 88, bottom: 12, left: 88 }}>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="fillKey" />} />
        {/* Inside: what each class is made of, aligned under the arc it belongs to. */}
        <Pie
          data={parts}
          dataKey="value"
          nameKey="fillKey"
          outerRadius="52%"
          paddingAngle={2}
          cornerRadius={2}
          stroke="none"
          isAnimationActive={false}
        >
          {parts.map((child) => (
            <Cell key={child.key} fill={`var(--color-${child.fillKey})`} />
          ))}
        </Pie>
        {/* Outside: the classes, and the only ring that carries names. */}
        <Pie
          data={classes}
          dataKey="value"
          nameKey="fillKey"
          innerRadius="59%"
          outerRadius="78%"
          paddingAngle={2}
          cornerRadius={2}
          stroke="none"
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

    const radius = outerRadius + 14
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const onTheRight = x >= cx

    return (
      <text x={x} y={y} textAnchor={onTheRight ? 'start' : 'end'} dominantBaseline="central" className="fill-foreground" fontSize={13}>
        <tspan x={x} dy="-0.4em" fontWeight={500}>{payload.label}</tspan>
        <tspan x={x} dy="1.25em" fontSize={12} className="fill-muted-foreground tabular-nums">{valueFormatter(payload.value ?? 0)}</tspan>
      </text>
    )
  }
}
