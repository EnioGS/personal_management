import { useEffect, useRef } from 'react'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

/**
 * Only the pieces in use are registered, so the bundle carries a pie and a tooltip rather
 * than every chart ECharts can draw. A new kind of chart means one more import here.
 */
echarts.use([PieChart, TooltipComponent, CanvasRenderer])

/**
 * An ECharts canvas, for the charts Recharts has no shape for.
 *
 * Recharts stays the default — it is SVG, so it inherits the app's colours from CSS and
 * needs no bridge. This is the other road, for a chart whose form is the point: a sunburst,
 * a sankey, a calendar. What it costs is that a canvas is drawn rather than styled, so
 * colours arrive as values and the whole option is rebuilt when the theme changes.
 *
 * The resize is deliberately rAF-throttled: the chat panel drags the dashboard's width a
 * frame at a time, and a canvas told to resize on every observer callback is the shape of
 * bug that made the composer flicker.
 */
export function EChart({ option, className }: { option: EChartsCoreOption; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!host.current) return
    const instance = echarts.init(host.current, undefined, { renderer: 'canvas' })
    chart.current = instance

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => instance.resize())
    })
    observer.observe(host.current)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  // `true` replaces the option rather than merging: a series with fewer slices than last
  // time would otherwise keep the ones it no longer has.
  useEffect(() => { chart.current?.setOption(option, true) }, [option])

  return <div ref={host} className={className ?? 'h-full w-full'} />
}
