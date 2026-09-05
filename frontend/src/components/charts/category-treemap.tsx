import { Treemap } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { colorForKey } from './chart-colors'

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
 * What each thing is worth, as area.
 *
 * A treemap answers the question a ranked list answers, in the space a pie wastes: the
 * biggest categories are the biggest boxes, and forty of them fit where a list would
 * have scrolled. Its cost is precision — nobody reads an area to two decimal places —
 * so every box that has room carries its own number, and the tooltip carries the rest.
 *
 * A box only says what fits. A label needs a box to be legible in, a value needs more,
 * and the comparison arrow needs more still, so the small boxes at the tail stay clean
 * rather than becoming a stack of clipped text.
 */
export function CategoryTreemap({ items, valueFormatter, emptyLabel }: CategoryTreemapProps) {
  const positive = items.filter((item) => item.value > 0)
  if (positive.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  // Colours come from the entity, as everywhere else; the keys are slugged because they
  // become CSS custom properties, and a category may be called anything at all.
  const data = positive.map((item, index) => ({ ...item, name: item.label, slot: `slot${index}` }))
  const config: ChartConfig = Object.fromEntries(
    data.map((item) => [item.slot, { label: item.label, theme: colorForKey(item.key) }]),
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <Treemap data={data} dataKey="value" isAnimationActive={false} stroke="var(--card)" content={<Cell />}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [valueFormatter(value as number), ` ${name}`]}
            />
          }
        />
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

    const fits = { label: width >= 46 && height >= 22, value: width >= 62 && height >= 44, arrow: width >= 74 && height >= 64 }
    const fontSize = Math.max(9, Math.min(18, width / 7, height / 3))

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={`var(--color-${slot})`} stroke="var(--card)" strokeWidth={2} rx={3} />
        {fits.label && (
          <text
            x={x + width / 2}
            y={y + height / 2 - (fits.value ? fontSize * 0.45 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.6}
            paintOrder="stroke"
            fontSize={fontSize}
            fontWeight={600}
          >
            {clip(label ?? '', width, fontSize)}
          </text>
        )}
        {fits.value && value !== undefined && (
          <text
            x={x + width / 2}
            y={y + height / 2 + fontSize * 0.8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fillOpacity={0.9}
            fontSize={Math.max(9, fontSize * 0.72)}
          >
            {valueFormatter(value)}
          </text>
        )}
        {fits.arrow && comparison !== undefined && Number.isFinite(comparison) && (
          <text
            x={x + width / 2}
            y={y + height / 2 + fontSize * 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fillOpacity={0.85}
            fontSize={Math.max(9, fontSize * 0.66)}
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
  const fits = Math.floor((width - 8) / (fontSize * 0.58))
  return label.length <= fits ? label : `${label.slice(0, Math.max(1, fits - 1))}…`
}
