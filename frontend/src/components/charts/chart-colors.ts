export interface ThemedColor {
  light: string
  dark: string
}

/**
 * Validated categorical palette (dataviz skill, references/palette.md), re-themed to
 * open on the app's brand hue instead of the skill's default blue-first order — same
 * method, same six checks, different opening color. Slot 1's hue is the brand's
 * (oklch(... 150), see index.css --brand), nudged from C 0.09/0.10 to 0.12/0.11 to
 * clear the palette's chroma floor (below it a hue reads as gray, see
 * color-formula.md check 3) — the smallest change that gets it past the gate, not a
 * new color. Slots 2-8 are the skill's own remaining seven hues, kept in their
 * validated relative order.
 *
 * Fixed order, never cycled — validated with scripts/validate_palette.js against this
 * app's actual light/dark surfaces (all checks pass; three light-mode slots sit below
 * 3:1 contrast by design, mitigated by always-visible legends, per the skill's relief
 * rule). Re-run the validator before changing any value here.
 */
export const CATEGORICAL_PALETTE: ThemedColor[] = [
  { light: '#33854a', dark: '#5aa26b' }, // 1 green (brand)
  { light: '#2a78d6', dark: '#3987e5' }, // 2 blue
  { light: '#eb6834', dark: '#d95926' }, // 3 orange
  { light: '#1baf7a', dark: '#199e70' }, // 4 aqua
  { light: '#eda100', dark: '#c98500' }, // 5 yellow
  { light: '#e87ba4', dark: '#d55181' }, // 6 magenta
  { light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
  { light: '#e34948', dark: '#e66767' }, // 8 red
]

/**
 * Past the palette's 8 validated slots, more hues are not the answer — the dataviz
 * skill treats a generated/cycled categorical hue as an accessibility anti-pattern:
 * distinguishability (colorblind or not) degrades past ~7-8 regardless of how the
 * colors are chosen. The correct handling of "more categories than colors" is
 * `foldTopCategories` (aggregations.ts): fold the smallest into one "other" slice and
 * let a table carry the full breakdown, per the skill's series-count ladder.
 */
export const MAX_CATEGORICAL_SERIES = CATEGORICAL_PALETTE.length - 1

/** Deterministic, well-distributed across a small modulus — not for anything security-sensitive. */
function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

/**
 * A stable color for an arbitrary key (a category name, an asset ticker, an account) —
 * the same key always lands on the same slot, regardless of what other keys are
 * present in a given render or how many there are. Assigning by array *position*
 * instead (`data[i]`) breaks the moment a filter changes which entities are on
 * screen — a survivor gets repainted even though nothing about it changed, which the
 * dataviz skill calls out explicitly ("color follows the entity, never its rank").
 *
 * Cap the category count with `foldTopCategories` before calling this — collisions
 * (two keys landing on the same slot) become possible past `MAX_CATEGORICAL_SERIES`
 * distinct keys, which is exactly the case that folding avoids.
 */
export function colorForKey(key: string): ThemedColor {
  return CATEGORICAL_PALETTE[hashString(key) % CATEGORICAL_PALETTE.length]
}

/**
 * The colour for a place in a ranked list, rather than for a name.
 *
 * A hash gives an entity the same colour wherever it appears, which is right for a chart
 * read against another chart — and wrong for a list read top to bottom, where the only
 * thing that matters is that no row wears its neighbour's colour. Walking the palette by
 * position guarantees that; past its eight slots the colours repeat, but never adjacently.
 */
export function colorForRank(rank: number): ThemedColor {
  return CATEGORICAL_PALETTE[rank % CATEGORICAL_PALETTE.length]
}

/**
 * The same colour, diluted a step further — for the parts of a thing, which belong to it.
 *
 * One hue, thinned: the parts of one category are one family, and a new hue per part would
 * say they were unrelated. Thinned toward white in both themes, the way ink is thinned
 * rather than the way a thing is shaded — mixing toward the dark theme's own background
 * would read as a shadow cast over the later rows, which says something about depth that
 * nothing here means.
 *
 * Capped well short of the paper so the last part of a long list is still a colour.
 */
export function tintedColor(color: ThemedColor, step: number): ThemedColor {
  if (step <= 0) return color
  const kept = `${Math.round(Math.max(0.4, 1 - step * 0.16) * 100)}%`
  return {
    light: `color-mix(in oklab, ${color.light} ${kept}, white)`,
    dark: `color-mix(in oklab, ${color.dark} ${kept}, white)`,
  }
}

/**
 * A CSS-custom-property-safe id for an arbitrary series key (a category, an account
 * name...). `components/ui/chart.tsx` themes a series by emitting `--color-<key>` and
 * referencing it back as `var(--color-<key>)` — valid only when `<key>` is a bare CSS
 * identifier. A key straight from user data ("Banco Inter", "Contas de Casa") breaks
 * that silently: the browser drops the malformed declaration/reference and the mark
 * renders with no color at all, with no console error to point at why. Every chart
 * wrapper in this folder must route a data-derived key through this before using it as
 * a ChartConfig key or inside `var(--color-...)`; the real dataKey/nameKey binding
 * recharts uses to read values back out of the data (a plain JS property name, which
 * can be any string) is untouched — only the CSS side needs sanitizing.
 */
export function chartSafeKey(key: string): string {
  const slug = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  return slug || 'series'
}

/**
 * The diverging pair (dataviz skill, references/palette.md): blue/red poles, for a
 * value that has a genuine polarity around zero — money in vs. out, not "series 4".
 * Kept separate from the categorical palette on purpose: reusing categorical slot 2
 * (also blue) here is intentional — same hue, different *job* — but red is not
 * CATEGORICAL_PALETTE's red; the diverging pair is validated as its own two-color set,
 * not as members of the 8-hue categorical order.
 */
export const DIVERGING_PAIR = {
  positive: { light: '#2a78d6', dark: '#3987e5' }, // in / above baseline
  // Out / below the baseline, in wine rather than in brick: money leaving is the one
  // thing on these charts that should read as grave. The dark half is the lightest wine
  // that still clears 3:1 against the card behind it (#c94a60, 3.0) — go deeper and the
  // bars start dissolving into the surface they sit on.
  negative: { light: '#8c2233', dark: '#c94a60' },
} as const

/** Fixed per-domain identity colors, reused everywhere that series appears (Overview + its own leaf chart). */
export const DOMAIN_COLOR = {
  /** The rollup/overview metric (running balance, combined portfolio value) — wears the brand color. */
  balance: CATEGORICAL_PALETTE[0],
  spending: CATEGORICAL_PALETTE[2],
  variableIncome: CATEGORICAL_PALETTE[1],
  fixedIncome: CATEGORICAL_PALETTE[4],
  contributions: CATEGORICAL_PALETTE[5],
  cards: CATEGORICAL_PALETTE[6],
  dividends: CATEGORICAL_PALETTE[7],
  /**
   * What a month netted — the tile, the line on the capital chart, the middle bar on the
   * cash flow chart: one quantity, one colour, wherever Movements draws it.
   *
   * It shares its slot with fixed income, which is a holding rather than a flow and never
   * shares a chart with it; the two meet only across cards, where each carries its own
   * legend.
   */
  cashFlow: CATEGORICAL_PALETTE[4],
  /** Holdings nobody has classed — a colour that is plainly not one of the classes. */
  unclassified: CATEGORICAL_PALETTE[6],
} as const
