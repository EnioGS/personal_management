# Dual deployment: Docker (anywhere) + GitHub Pages, from the same build

## Status

Accepted

## Context

This project should support going from "runs on my machine" to "viewable
online" with minimal friction as a first step (GitHub Pages, essentially
free), while remaining portable to more capable/custom infrastructure later
(a VPS, Railway, Fly, Heroku's container mode) without being rebuilt from
scratch for that transition.

## Decision

Both deployment paths consume the identical `npm run build` output, they
just deliver it differently: nginx-in-Docker (see the containerization
decision) works anywhere Docker runs; `.github/workflows/deploy-pages.yml`
builds and publishes straight to GitHub Pages with no container involved.
Vite's `base` is set from `VITE_BASE_PATH` at build time, computed in the
Pages workflow as `/${{ github.event.repository.name }}/` so it self-adjusts
to match this repo's actual name (GitHub Pages project sites serve from a
subpath, not the domain root).

## Consequences

No deployment path is a dead end or requires redoing the build setup.
GitHub Pages requires a one-time manual step (repo Settings → Pages →
source: GitHub Actions) that can't be scripted from outside GitHub's UI.
Pages is static-only and can never serve a backend — fine today, a real
constraint once one exists.
