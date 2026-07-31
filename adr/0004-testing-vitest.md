# Testing: Vitest, colocated, narrow initial scope

## Status

Accepted

## Context

As a template, most of its current UI content (Notes, Settings panels) is
intentionally illustrative and expected to be replaced per-project — testing
it thoroughly would be wasted effort. But some of what's here is genuinely
reusable infrastructure future projects will keep: the encrypted-storage
crypto logic and the section/item navigation store.

## Decision

Use Vitest (shares Vite's config/transform pipeline, near-zero extra setup)
with tests colocated next to the code they cover, matching the sections
colocation pattern, rather than a separate top-level `tests/` directory.
Initial coverage is narrow and deliberate: `secure-db.ts`'s encrypt/decrypt
round-trip and `ui-store.ts`'s selection logic — not the demo UI components.

## Consequences

Regression protection where a bug would actually matter (data loss/security,
or breaking navigation for every feature), without the overhead of full
component/UI testing for content meant to be deleted. A top-level
`tests/`/`e2e/` directory remains reserved for future whole-stack tests
spanning frontend and backend, once there's a backend to integrate with.
