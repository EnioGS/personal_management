import { Cell, Pie, PieChart, Sector } from 'recharts'
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
  midAngle?: number
}

const RADIAN = Math.PI / 180
/** How far a slice sits out from the centre. The outer ring travels further, being further out. */
const EXPLODE = { parts: 4, classes: 7 }

/**
 * Pushes a slice out along its own middle, away from the centre.
 *
 * Which is what an exploded pie is: not slices with gaps between them, but slices that
 * have each moved outward, the gaps being what is left behind. Every slice leaves in a
 * different direction, so the ring comes apart into the things it was made of.
 */
function exploded(offset: number) {
  return function ExplodedSector(props: unknown) {
    const sector = props as { cx: number; cy: number; midAngle: number }
    const angle = -sector.midAngle * RADIAN
    return (
      <Sector
        {...(props as object)}
        cx={sector.cx + Math.cos(angle) * offset}
        cy={sector.cy + Math.sin(angle) * offset}
      />
    )
  }
}
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
 * Both rings are exploded: every slice has moved out along its own middle, so the gaps
 * between them are what each one left behind rather than a stroke drawn between them.
 * That is what makes a ring read as several things instead of one striped thing, and it
 * keeps a slice's angle exactly where it was, which is what lets the inner pieces stay
 * legible as parts of the arc above them.
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
          outerRadius="50%"
          cornerRadius={2}
          stroke="none"
          isAnimationActive={false}
          shape={exploded(EXPLODE.parts)}
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
          outerRadius="76%"
          cornerRadius={2}
          stroke="none"
          isAnimationActive={false}
          shape={exploded(EXPLODE.classes)}
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
    const { points, percent, midAngle = 0 } = props as LabelLineProps
    if (percent < LABEL_FLOOR || !points || points.length < 2) return <g />
    // Recharts measured the line against the ring as it would have been drawn unexploded,
    // so the whole line travels the same distance the slice did.
    const angle = -midAngle * RADIAN
    const dx = Math.cos(angle) * EXPLODE.classes
    const dy = Math.sin(angle) * EXPLODE.classes
    return (
      <polyline
        points={points.map((point) => `${point.x + dx},${point.y + dy}`).join(' ')}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1}
      />
    )
  }

  function SliceLabel(props: unknown) {
    const { cx, cy, midAngle, outerRadius, percent, payload } = props as LabelProps
    if (percent < LABEL_FLOOR) return null

    // The slice moved out, so its name moves with it; otherwise the line would point at
    // where the slice used to be.
    const radius = outerRadius + EXPLODE.classes + 14
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
