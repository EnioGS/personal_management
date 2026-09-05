# ECharts alongside Recharts, for the charts that are the analysis

## Status

Accepted — extends adr/0024 and adr/0025, whose Recharts wrappers stay exactly
as they are.

## Context

The holdings chart wanted two things Recharts has no concept of: rings exploded
away from the centre, and a hierarchy drawn as one shape. Both were assembled
out of custom sector shapes, and each adjustment had to be made twice — once in
the shape, once by hand in the label and its leader line, because Recharts
computes those from the sector it would have drawn rather than the one we drew.
Two sources of truth for one geometry, and the artifacts that follow: a hole
opened in the middle of a disc by a radius nudge meant for a ring, a label
pointing where a slice used to be.

Meanwhile the dashboards still want charts Recharts cannot draw at all — a
sankey of income into categories, a calendar heatmap of spending by day, a
sunburst, a gauge against a budget, a boxplot of the months behind an average.

## Decision

**ECharts joins Recharts; it does not replace it.** Recharts remains the default
and keeps every chart it already draws: it is SVG, so it inherits the app's
colours from CSS and needs no bridge, and rewriting working charts would buy
nothing. ECharts is for the charts whose form is the point.

**Registered piece by piece.** `components/charts/echart.tsx` imports from
`echarts/core` and registers only what is used — today `PieChart`,
`TooltipComponent`, `CanvasRenderer`. A new kind of chart adds one import there,
and nothing else arrives with it.

**One wrapper owns the canvas.** It initialises, disposes, replaces the option
wholesale rather than merging, and resizes on a rAF-throttled `ResizeObserver` —
the chat panel drags the dashboard's width a frame at a time, and a canvas told
to resize on every observer callback is the shape of bug that made the composer
flicker.

**Colours are handed over as values.** A canvas cannot read a custom property,
so `cssValue` resolves them and `theme-store` gained an `isDark` flag to rebuild
the option when the theme changes. That is the real cost of the second library,
and it is confined to the wrapper and the charts that use it.

## Consequences

- The bundle grows from 510KB gzip to 661KB, in one eager chunk. Accepted for
  now, deliberately: the wrapper is a single import boundary, so putting these
  charts behind `React.lazy` is a one-line change the day the first load starts
  to matter. Nothing else needs to move for that.
- Two chart libraries mean two idioms. The rule that keeps that honest is the
  one above: Recharts unless the chart cannot be drawn in it.
- An exploded ring is `selectedOffset` on selected slices, which offsets each
  slice along its own middle. That is what every library means by exploded, and
  it still slides a slice covering most of a ring off to one side — the effect is
  standard, the geometry is not the library's fault.
