# i18n: react-i18next, default Portuguese, namespace-per-section

## Status

Accepted

## Context

The template needs to support multiple languages (initially English and
Portuguese, default Portuguese) in a way that's convenient to expand as the
template is used in real projects, using the standard approach the industry
uses for React apps — rather than reinventing pluralization, interpolation,
and translator-tooling compatibility from scratch.

## Decision

Use react-i18next, the de facto standard for React (largest ecosystem, what
most translation-management platforms integrate with), over react-intl/Lingui
or a hand-rolled store-based solution. Each section owns its own
`locales/{en,pt}.json`, matching the existing colocation pattern
(`src/sections/<feature>/locales/`); `src/locales/common/` holds only strings
shared across sections. Resources are bundled statically (no lazy-loading
backend) since the app is small. `t()` calls are type-checked against the
English resources via `src/i18next.d.ts`, except where a key is data-driven
(`section.labelKey`), which is cast past the check with `as never` — a
recognized i18next pattern for this case.

## Consequences

A missing or mistyped static translation key is a compile error, not a
runtime surprise. Adding a translated section requires one extra registration
point beyond the sections registry itself (registering its namespace in
`src/i18n.ts`), since resources are static rather than fetched lazily — an
acceptable tradeoff at this app's size, worth revisiting if the number of
sections/languages grows significantly.
