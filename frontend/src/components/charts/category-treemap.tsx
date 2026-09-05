import { Treemap } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export interface TreemapItem {
  key: string
  label: string
  value: number
  /** Change against a contextual comparison window, expressed as a fraction. */
  comparison?: number
}

interface CategoryTreemapProps {
  items: TreemapItem[]
  valueFormatter: (value: number) => string
  emptyLabel: string
}

/** Recharts hands a cell every field of its datum, plus the rectangle it was given. */
interface CellProps {
  x: number
  y: number
  width: number
  height: number
  slot?: string
  label?: string
  value?: number
  comparison?: number
}

/**
 * A single-hue ramp, ordered by rank: the largest box darkest, the tail palest.
 *
 * Not a categorical palette and not a second variable — a treemap already encodes the
 * ranking in area, and eight validated hues scattered across forty boxes reads as
 * confetti rather than as data. One hue keeps the panel calm, and the gradient runs the
 * same direction as the areas, so colour and size agree instead of competing.
 *
 * The lightness range is bounded well away from white at both ends so a single text
 * colour stays legible on every box; the ends swap between themes so the darkest box is
 * always the one furthest from the page behind it.
 */
const RAMP = {
  light: { from: [0.44, 0.15], to: [0.72, 0.07] },
  dark: { from: [0.58, 0.16], to: [0.34, 0.07] },
} as const
const RAMP_HUE = 25

function rampColor(position: number): { light: string; dark: string } {
  const at = (ends: { from: readonly [number, number] | number[]; to: readonly [number, number] | number[] }) => {
    const lightness = ends.from[0] + (ends.to[0] - ends.from[0]) * position
    const chroma = ends.from[1] + (ends.to[1] - ends.from[1]) * position
    return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${RAMP_HUE})`
  }
  return { light: at(RAMP.light), dark: at(RAMP.dark) }
}

/**
 * What each thing is worth, as area.
 *
 * A treemap answers the question a ranked list answers, in the space a pie wastes: the
 * biggest categories are the biggest boxes, and forty of them fit where a list would
 * have scrolled. Its cost is precision — nobody reads an area to two decimal places —
 * so every box that has room carries its own number, and the tooltip carries the rest.
 *
 * A box only says what fits. A label needs a box to be legible in, a value needs more,
 * and the comparison arrow needs more still, so the small boxes at the tail stay clean
 * rather than becoming a stack of clipped text. Nothing is drawn between the boxes: a
 * treemap is one shape divided, and a border around every piece turns a surface into a
 * grid of tiles.
 */
export function CategoryTreemap({ items, valueFormatter, emptyLabel }: CategoryTreemapProps) {
  const positive = items.filter((item) => item.value > 0)
  if (positive.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const ranked = [...positive].sort((left, right) => right.value - left.value)
  // The slots are indices because they become CSS custom properties, and a category may
  // be called anything at all.
  const data = ranked.map((item, index) => ({ ...item, name: item.label, slot: `slot${index}` }))
  const config: ChartConfig = Object.fromEntries(
    data.map((item, index) => [
      item.slot,
      { label: item.label, theme: rampColor(ranked.length < 2 ? 0 : index / (ranked.length - 1)) },
    ]),
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <Treemap data={data} dataKey="value" isAnimationActive={false} content={<Cell />}>
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [valueFormatter(value as number), ` ${name}`]} />} />
      </Treemap>
    </ChartContainer>
  )

  function Cell(props: unknown) {
    // Recharts spreads a node's own fields onto the cell, but has moved them under
    // `payload` before now; reading both keeps the cells drawn either way.
    const node = props as CellProps & { payload?: CellProps }
    const { x, y, width, height } = node
    const { slot, label, value, comparison } = { ...node.payload, ...node }
    if (!slot || width <= 0 || height <= 0) return null

    const fits = { label: width >= 54 && height >= 26, value: width >= 68 && height >= 48, arrow: width >= 80 && height >= 70 }
    // Big enough to read, never big enough to shout: a treemap's headline is its area.
    const fontSize = Math.max(10, Math.min(15, width / 9, height / 4))
    const centre = y + height / 2

    return (
      <g className="transition-opacity hover:opacity-85">
        <rect x={x} y={y} width={width} height={height} fill={`var(--color-${slot})`} />
        {fits.label && (
          <text
            x={x + width / 2}
            y={centre - (fits.value ? fontSize * 0.62 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={fontSize}
            fontWeight={550}
            letterSpacing="0.01em"
          >
            {clip(label ?? '', width, fontSize)}
          </text>
        )}
        {fits.value && value !== undefined && (
          <text
            x={x + width / 2}
            y={centre + fontSize * 0.72}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fillOpacity={0.82}
            fontSize={fontSize * 0.82}
            className="tabular-nums"
          >
            {valueFormatter(value)}
          </text>
        )}
        {fits.arrow && comparison !== undefined && Number.isFinite(comparison) && (
          <text
            x={x + width / 2}
            y={centre + fontSize * 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fillOpacity={0.68}
            fontSize={fontSize * 0.74}
            className="tabular-nums"
          >
            {`${comparison >= 0 ? '▲' : '▼'} ${(Math.abs(comparison) * 100).toFixed(0)}%`}
          </text>
        )}
      </g>
    )
  }
}

/** SVG has no ellipsis of its own, so a label too long for its box is cut and marked. */
function clip(label: string, width: number, fontSize: number): string {
  const fits = Math.floor((width - 10) / (fontSize * 0.56))
  return label.length <= fits ? label : `${label.slice(0, Math.max(1, fits - 1))}…`
}
