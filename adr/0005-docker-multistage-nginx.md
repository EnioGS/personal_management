# Containerization: one Dockerfile, multiple stages, nginx for production

## Status

Accepted

## Context

The frontend needs both a hot-reload dev environment and a production-ready
static deployment, without maintaining two separate Dockerfiles or
duplicating the shared `npm install` step.

## Decision

`frontend/Dockerfile` has a `dev` stage (Vite dev server) and a `production`
stage (static build served by nginx), both descending from a shared `deps`
stage so dependency installation is cached across both.
`docker-compose.yml`'s `build.target` reads `BUILD_TARGET` from `.env`, and
the image is tagged per-target (`template_web-frontend-${BUILD_TARGET}`) so
switching targets can't silently reuse a stale image built from the other
stage — a real bug caught during testing of this exact setup.

## Consequences

One file to maintain, correct caching between dev and production builds, and
no risk of accidentally running a stale image after switching `BUILD_TARGET`.
See the dual-deployment decision for how this fits alongside GitHub Pages.
