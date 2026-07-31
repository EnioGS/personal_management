# Colocate Dockerfiles inside each component's directory

## Status

Accepted

## Context

The repo holds (or will hold) multiple deployable components — frontend, and
eventually backend. Their deploy configuration needs a home that's easy to
find and keep in sync with the code it builds.

## Decision

Each component's Dockerfile lives inside that component's own directory
(`frontend/Dockerfile`, and `backend/Dockerfile` once that stack exists)
rather than in a shared top-level `deploy/`. This matches how
`docker-compose.yml`, most CI systems, and platforms like Railway/Render/Fly
expect a per-service build context.

## Consequences

Deploy concerns stay colocated with the code that changes together. A
top-level `deploy/` can still be added later for genuinely cross-cutting
infra (reverse-proxy config, k8s manifests) without needing to move the
Dockerfiles.
