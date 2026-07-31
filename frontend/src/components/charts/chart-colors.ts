export interface ThemedColor {
  light: string
  dark: string
}

/**
 * Validated default categorical palette (dataviz skill, references/palette.md).
 * Fixed order, never cycled — validated against this app's actual light/dark
 * surfaces via scripts/validate_palette.js (all checks pass; three light-mode
 * slots sit below 3:1 contrast by design, mitigated by always-visible legends).
 */
export const CATEGORICAL_PALETTE: ThemedColor[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // 1 blue
  { light: '#eb6834', dark: '#d95926' }, // 2 orange
  { light: '#1baf7a', dark: '#199e70' }, // 3 aqua
  { light: '#eda100', dark: '#c98500' }, // 4 yellow
  { light: '#e87ba4', dark: '#d55181' }, // 5 magenta
  { light: '#008300', dark: '#008300' }, // 6 green
  { light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
  { light: '#e34948', dark: '#e66767' }, // 8 red
]

/** Fixed per-domain identity colors, reused everywhere that series appears (Overview + its own leaf chart). */
export const DOMAIN_COLOR = {
  income: CATEGORICAL_PALETTE[0],
  spending: CATEGORICAL_PALETTE[1],
  variableIncome: CATEGORICAL_PALETTE[2],
  fixedIncome: CATEGORICAL_PALETTE[3],
  contributions: CATEGORICAL_PALETTE[4],
  /** The rollup/overview metric (running balance, combined portfolio value) — distinct from any single domain above. */
  balance: CATEGORICAL_PALETTE[5],
} as const
