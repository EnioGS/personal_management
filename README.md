# Web Project Template

A reusable starting point for personal web projects: a frontend, a backend,
and the glue (Docker Compose, env config, CI) to run them together. Meant to
be cloned/forked per-project, then adapted — not a framework you depend on.

Two things it optimizes for:
- **Flexible/quick to adapt** — minimal opinions outside the frontend, so a
  new project can swap pieces without fighting the template.
- **Sober design language** — a neutral, VSCode-inspired visual structure
  (icon sidebar, panels, no flashy color) rather than a "branded" UI kit look.

## Structure

```
.
├── frontend/                  # Vite + React + TypeScript + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/            # shadcn/ui primitives (button, resizable, tooltip, ...)
│   │   │   └── layout/        # activity-bar / secondary-bar / app-shell / brand-mark
│   │   ├── sections/          # feature registry — the extensibility mechanism
│   │   │   ├── types.ts
│   │   │   ├── index.ts       # aggregates all sections into one array
│   │   │   ├── notes/         # notes.section.ts + panel/store/secure-db + locales/
│   │   │   └── settings/      # settings.section.ts + appearance/general panels + locales/
│   │   ├── store/
│   │   │   ├── ui-store.ts     # active section/item, secondary-bar collapsed state
│   │   │   ├── theme-store.ts  # light/dark/system theme
│   │   │   └── locale-store.ts # pt/en language
│   │   ├── locales/common/    # shared strings not owned by one section
│   │   ├── lib/
│   │   │   ├── utils.ts       # cn() helper (shadcn convention)
│   │   │   └── locale.ts      # Locale type, storage key, Intl locale-tag mapping
│   │   ├── i18n.ts            # i18next init — registers every namespace's resources
│   │   ├── i18next.d.ts       # type-checks t() keys against the English resources
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile             # multi-stage: deps → dev / build → production (nginx)
│   ├── nginx.conf             # serves the production static build
│   ├── components.json        # shadcn/ui config (style, aliases, neutral base color)
│   └── .nvmrc                 # pinned Node version
├── backend/                    # empty — stack intentionally not chosen yet
├── adr/                        # architecture decision records (Nygard format)
├── .github/workflows/
│   ├── frontend-ci.yml        # lint + test + build on push/PR touching frontend/
│   └── deploy-pages.yml       # builds + publishes frontend/ to GitHub Pages
├── docker-compose.yml         # frontend service only; backend commented out
├── .env.example               # copy to .env and fill in
├── .env                        # local secrets/config, gitignored
├── .editorconfig
├── AGENTS.md / CLAUDE.md      # local-only agent instructions, gitignored
└── README.md
```

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui —
  fast to build with, sober default look. [adr/0001](adr/0001-frontend-stack-vite-react-tailwind-shadcn.md)
- **Local-first encrypted storage**: Dexie (IndexedDB) + Web Crypto + Zustand
  — for client-side data that should stay off any backend.
  [adr/0002](adr/0002-local-first-encrypted-storage.md)
- **i18n**: react-i18next, default Portuguese, namespace-per-section.
  [adr/0003](adr/0003-i18n-react-i18next.md)
- **Testing**: Vitest, colocated with the code it covers.
  [adr/0004](adr/0004-testing-vitest.md)
- **Containerization**: Docker, one multi-stage Dockerfile (dev / production
  via nginx). [adr/0005](adr/0005-docker-multistage-nginx.md)

## Decisions

- Dockerfiles colocated per component, not a shared `deploy/`.
  [adr/0006](adr/0006-colocate-dockerfiles-per-component.md)
- Two-level, VSCode-style navigation as a data-driven registry
  (`src/sections/`), replacing shadcn/ui's `Sidebar`.
  [adr/0007](adr/0007-two-level-navigation-registry.md)
- Reskinning is two files — `brand-mark.tsx` + two CSS tokens.
  [adr/0008](adr/0008-reskinning-two-files.md)
- Backend stack deferred on purpose.
  [adr/0009](adr/0009-backend-stack-deferred.md)
- CI intentionally minimal: lint + test + build, frontend only for now.
  [adr/0010](adr/0010-ci-minimal-scope.md)
- Agent commits carry no AI attribution.
  [adr/0011](adr/0011-agent-commit-convention.md)
- Dual deployment (Docker anywhere + GitHub Pages) from one build output.
  [adr/0012](adr/0012-dual-deployment-docker-github-pages.md)

See [adr/](adr/) for the full reasoning behind these and the stack choices
above.

## Frontend

```bash
docker compose up   # dev server at http://localhost:5173, hot reload
```

Add more shadcn/ui components with `npx shadcn@latest add <component>` (run
on the host — needs Node/npm installed locally).

Tests: `npm run test` (Vitest, also part of CI).

## Backend

Not started. Once a stack is chosen: add `backend/Dockerfile` (co-located,
matching the frontend's layout), then uncomment the `backend` service block
in `docker-compose.yml`.

## Docker Compose

```bash
cp .env.example .env   # if not already present
docker compose up --build
```

`BUILD_TARGET` in `.env` picks the Dockerfile stage: `dev` (default) or
`production` (nginx serving the optimized static build).

## Deployment

Two independent paths — see [adr/0012](adr/0012-dual-deployment-docker-github-pages.md):

- **Docker, anywhere Docker runs**:
  ```bash
  docker build --target production -t <name> ./frontend
  ```
  Platforms that assign the port dynamically (Heroku, Cloud Run) need an
  entrypoint step templating `$PORT` into `nginx.conf` — not needed for a
  static host/VPS where you control the port mapping directly.
- **GitHub Pages**: `.github/workflows/deploy-pages.yml` builds and deploys
  on every push to `main`. One-time manual step: repo **Settings → Pages →
  Source: GitHub Actions**.

## Environment variables

See `.env.example` — `BUILD_TARGET`/`FRONTEND_CONTAINER_PORT` (Docker stage
selection), `FRONTEND_PORT`, `BACKEND_PORT`, `DATABASE_URL` placeholder, etc.
Copy it to `.env`, which is gitignored.

## License

[GNU AGPL-3.0](LICENSE) — see [adr/0013](adr/0013-license-agpl-3-0.md) for
the reasoning.

Copyright (C) 2026 EnioGS

## Open items / next steps

- Pick a backend stack, add `backend/Dockerfile`, restore the compose service.
- Extend CI once the backend exists.
