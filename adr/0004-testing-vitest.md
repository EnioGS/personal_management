# Testing: Vitest, colocated with the code it covers

## Status

Accepted

## Context

This project's UI content isn't disposable demo material — each section is a
permanent feature of the app, not illustrative placeholder content expected
to be swapped out. Testing only the shared infrastructure underneath
(encrypted-storage crypto, section/item navigation store) would leave real
feature logic uncovered.

## Decision

Use Vitest (shares Vite's config/transform pipeline, near-zero extra setup)
with tests colocated next to the code they cover, matching the sections
colocation pattern, rather than a separate top-level `tests/` directory.
Coverage spans both the shared infrastructure (`secure-db.ts`'s
encrypt/decrypt round-trip, `ui-store.ts`'s selection logic) and each
section's own panel/store logic, since that logic is real product behavior.

## Consequences

Regression protection where a bug would actually matter (data loss/security,
navigation breaking for every feature) as well as for section-specific
behavior, since there's no throwaway UI to exempt from coverage. More test
surface to maintain than an infra-only scope, but appropriate given
everything here ships as part of the product. A top-level `tests/`/`e2e/`
directory remains reserved for future whole-stack tests spanning frontend
and backend, once there's a backend to integrate with.
