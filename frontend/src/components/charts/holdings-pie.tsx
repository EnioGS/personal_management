import { useMemo } from 'react'
import { useThemeStore } from '@/store/theme-store'
import { tintedColor, type ThemedColor } from './chart-colors'
import { cssValue } from './css-value'
import { EChart } from './echart'
import type { EChartsCoreOption } from 'echarts/core'

export interface HoldingsRing {
  key: string
  label: string
  value: number
  color: ThemedColor
  /** What the slice is made of — the inner ring, in shades of the slice's own colour. */
  children: { key: string; label: string; value: number }[]
}

interface HoldingsPieProps {
  groups: HoldingsRing[]
  valueFormatter: (value: number) => string
  emptyLabel: string
}

/** How far each ring stands off the centre when its slices are pushed apart. */
const OFFSET = { parts: 5, classes: 10 }

/**
 * What is held, in two rings: the classes outside, what each is made of inside.
 *
 * The outer ring is the answer — how much is in cash, in fixed income, in variable income
 * — and it is the only ring that speaks, each class named on a line pointing at its own
 * arc. A legend would make the eye carry a colour across the card and back; a line just
 * points. The inner ring is the follow-up and stays quiet: every fund or paper sits inside
 * the arc of the class it belongs to, in a diluted shade of that class's colour, and
 * hovering says which is which.
 *
 * Drawn with ECharts rather than Recharts, which is the rest of the app's chart library:
 * an exploded ring is a first-class thing here (`selectedOffset` on selected slices) where
 * there it had to be assembled out of custom sector shapes, with the labels and their
 * leader lines re-derived by hand against geometry the library had already computed
 * differently. One source of truth for where a slice is was worth the dependency.
 */
export function HoldingsPie({ groups, valueFormatter, emptyLabel }: HoldingsPieProps) {
  const isDark = useThemeStore((store) => store.isDark)
  const held = groups.filter((group) => group.value > 0)

  const option = useMemo<EChartsCoreOption>(() => {
    const shade = (color: ThemedColor) => (isDark ? color.dark : color.light)
    const foreground = cssValue('--foreground')
    const muted = cssValue('--muted-foreground')

    return {
      animationDuration: 420,
      tooltip: {
        trigger: 'item',
        backgroundColor: cssValue('--popover'),
        borderColor: cssValue('--border'),
        textStyle: { color: cssValue('--popover-foreground'), fontSize: 12 },
        formatter: (params: { name: string; value: number; percent: number }) =>
          `${params.name}<br/><strong>${valueFormatter(params.value)}</strong> · ${params.percent}%`,
      },
      series: [
        {
          // Inside: what each class is made of, aligned under the arc it belongs to.
          type: 'pie',
          radius: ['22%', '46%'],
          padAngle: 1.5,
          selectedMode: 'multiple',
          selectedOffset: OFFSET.parts,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderRadius: 3 },
          data: held.flatMap((group) =>
            group.children.map((child, rank) => ({
              name: child.label,
              value: child.value,
              selected: true,
              itemStyle: { color: shade(tintedColor(group.color, rank)) },
            })),
          ),
        },
        {
          // Outside: the classes, and the only ring that carries names.
          type: 'pie',
          radius: ['58%', '74%'],
          padAngle: 2,
          selectedMode: 'multiple',
          selectedOffset: OFFSET.classes,
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: 'outer',
            alignTo: 'labelLine',
            formatter: (params: { name: string; value: number }) =>
              `{name|${params.name}}\n{value|${valueFormatter(params.value)}}`,
            rich: {
              name: { fontSize: 13, fontWeight: 500, color: foreground, lineHeight: 17 },
              value: { fontSize: 12, color: muted, lineHeight: 15 },
            },
          },
          labelLine: { show: true, length: 10, length2: 14, lineStyle: { color: muted } },
          data: held.map((group) => ({
            name: group.label,
            value: group.value,
            selected: true,
            itemStyle: { color: shade(group.color) },
          })),
        },
      ],
    }
  }, [held, isDark, valueFormatter])

  if (held.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  return <EChart option={option} />
}
