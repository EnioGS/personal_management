/**
 * A trend at zero reading cost inside a stat card — no axes, no labels, single hue,
 * last point marked (PLAN.md §3.4). Decorative-adjacent, so it stays a plain inline
 * SVG rather than a full chart component.
 */
export function Sparkline({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null

  const width = 100
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)

  const points = values.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2] as const)
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  )
}
