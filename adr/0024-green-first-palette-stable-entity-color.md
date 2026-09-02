# Green-first validated palette; color follows the entity, not its rank

## Status

Accepted — re-themes the palette introduced by the dataviz skill's default
instance, referenced (unmodified until now) since the charts were first
built.

## Context

Two independent problems, fixed together because both are in
`components/charts/chart-colors.ts`:

1. The brand identity is a muted green, and the chart palette opened on
   blue (the dataviz skill's own documented default). Re-theming to lead
   with the brand hue was the ask; "more categories should mean more
   colors" was also asked for, and had to be turned down as stated — the
   skill's non-negotiables treat a generated or cycled categorical hue past
   its validated slot count as an accessibility anti-pattern, since
   distinguishability (colorblind or not) degrades regardless of how the
   extra hues are chosen.
2. Every pie/bar/line series was colored by `CATEGORICAL_PALETTE[i %
   length]` — the *i-th* item in whatever the current render's data
   happened to be. Filtering a category out of view silently repainted
   every other slice, since their indices all shifted. The dataviz skill
   calls this out by name: "color follows the entity, never its rank."

## Decision

- **Re-themed, not regenerated.** Slot 1 is the brand's own hue
  (`oklch(... 150)`, see `index.css --brand`), nudged from chroma 0.09/0.10
  to 0.12/0.11 — the minimum change that clears the palette's chroma floor
  (below it a hue reads as gray). Slots 2-8 are the dataviz skill's own
  remaining seven hues, kept in their validated relative order. Re-run
  `scripts/validate_palette.js` against this app's real light/dark surfaces
  before touching any value here; the full six-check gate still applies.
- **`colorForKey(key)`**: a stable hash from an arbitrary string (a
  category, an account name, an asset ticker) to one of the 8 slots — the
  same key always lands on the same color regardless of what other keys
  are present in a given render. Collisions become possible past 8
  distinct keys, which is why it is never called without folding first.
- **`foldTopCategories()`** (`lib/aggregations.ts`): beyond
  `MAX_CATEGORICAL_SERIES` (7 — one slot reserved) distinct categories, the
  smallest fold into one "Outros" bucket by value. This, not a ninth hue,
  is the actual answer to "unlimited categories" — the overflow is legible
  in a table (every screen still has one) even where it can no longer be a
  distinct color.
- **`chartSafeKey(key)`**: sanitizes a key before it is used as a
  `ChartConfig` entry or inside `var(--color-<key>)`. This is a bug fix
  bundled into the same file for the same reason as the above: every chart
  wrapper themes a series via that CSS-custom-property convention, built
  directly from whatever string the caller passes as a series key — and a
  key with a space ("Banco Inter") is invalid CSS. The browser drops the
  malformed declaration and reference with no error, so the affected mark
  simply renders colorless. This already affected the existing pie charts
  for any multi-word category; it surfaced concretely once accounts (which
  are almost always multi-word) needed their own colors. The recharts
  `dataKey`/`nameKey` binding used to read values back out of row data is
  untouched — a plain JS property name, unlike a CSS identifier, can be any
  string.

## Consequences

Every chart in the app opens on brand-recognizable green without a second
hue family competing for the same "identity" role — the six-check gate
still holds in both themes. Filtering a category, account, card or asset
out of a chart no longer repaints anything that stayed. The one new
constraint: any future chart wrapper that themes a series through this
project's `ChartConfig` convention must route the key through
`chartSafeKey()` first, and — if it renders a legend, whose label lookup has
no fallback the way the tooltip's does — must also register the config
entry under the raw label as a second key purely for that lookup (see
`line-chart.tsx`/`pie-chart.tsx`).
