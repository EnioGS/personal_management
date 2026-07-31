# Defer backend stack selection

## Status

Accepted

## Context

This template's backend needs vary significantly per project (language,
framework, database), unlike the frontend where a single opinionated stack
serves most projects well. Picking one now would bias every future project
toward it regardless of fit.

## Decision

Ship the template with an empty `backend/` directory and no backend code,
Dockerfile, or dependencies. The `backend` service in `docker-compose.yml` is
commented out (rather than pointing at a Dockerfile that doesn't exist) until
a stack is picked per-project.

## Consequences

Every project starting from this template must still choose and scaffold its
own backend — deliberate, not an oversight. `docker-compose.yml` and CI stay
frontend-only until that happens.
