# Keep CI minimal: lint, test, build — frontend only

## Status

Accepted

## Context

CI should catch real regressions without becoming a maintenance burden
disproportionate to the template's current size, and shouldn't reference a
backend that doesn't exist yet.

## Decision

One GitHub Actions workflow (`frontend-ci.yml`) runs lint, test, and build on
pushes/PRs touching `frontend/`. No backend job until there's a backend to
build.

## Consequences

Fast, cheap CI that scales with what actually exists in the repo. Will need a
second job (or workflow) once a backend is chosen — tracked as an open item
in the README.
