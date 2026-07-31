# Reskinning is two files

## Status

Accepted

## Context

As a template meant to be reused across many projects, adapting the visual
identity (logo mark, brand color) for a specific product needs to be trivial
and hard to get wrong by missing a spot.

## Decision

`src/components/layout/brand-mark.tsx` (the icon) and the
`--brand`/`--brand-foreground` tokens in `src/index.css` (the color, in both
`:root` and `.dark`) are the only two places touched when reskinning.
Everything else in the app already follows the same CSS-variable palette.

## Consequences

Reskinning doesn't require hunting through the codebase for hardcoded
colors. Minor tradeoff: contributors must define new tokens in the same
`@theme inline` pattern rather than reaching for arbitrary Tailwind color
values, or the "one palette" guarantee breaks.
