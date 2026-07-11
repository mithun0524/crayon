# Deploying the marketing site (`apps/web`)

Live at **https://crayon-umber.vercel.app** — Vercel project `crayon`
(scope `mithun0524s-projects`).

## CI/CD (primary) — GitHub Actions → Vercel

The `deploy-web` job in `.github/workflows/ci.yml` deploys production
automatically on every push to `main` that touches `apps/web` (or repo root),
**after** the `ci-ok` gate passes. It builds `apps/web` as the Vercel CLI's
working directory, so the monorepo deploys correctly regardless of the Vercel
project's Root Directory setting.

**One-time setup — add a single repo secret:**

1. Vercel → Account Settings → **Tokens** → create a token.
2. GitHub → repo → Settings → Secrets and variables → Actions → **New secret**:
   - Name: `VERCEL_TOKEN`
   - Value: the token from step 1

The project/org IDs are non-secret and already set as `env` in the workflow
(`VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`).

> **Do not also enable Vercel's dashboard Git integration** for this repo — that
> would double-deploy. This workflow is the single source of truth. (If Git
> integration is currently connected, disconnect it: Vercel → `crayon` →
> Settings → Git.)

## Manual deploy (fallback)

`apps/web` is self-contained (own `package-lock.json`, no workspace deps), so it
deploys standalone:

```bash
cd apps/web
vercel link --yes --project crayon --scope mithun0524s-projects   # first time only
vercel deploy --prod --yes
```

The `--prod` deploy is auto-aliased to `crayon-umber.vercel.app`.

## Notes

- Build: `next build` (Next 16, Turbopack), ~30s. 17 routes, mostly static.
- `.vercel/` is gitignored — never commit it.
- History gotcha (2026-07): the project had Root Directory unset **and** no
  working Git auto-deploy, so the live site sat ~40 days stale despite merges.
  The Actions workflow above fixes this permanently; the manual command is the
  break-glass fallback.
