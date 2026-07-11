# Deploying the marketing site (`apps/web`)

Live at **https://crayon-umber.vercel.app** — Vercel project `crayon`
(scope `mithun0524s-projects`).

## How it deploys — Vercel native Git integration

The GitHub repo is connected to the Vercel project (`vercel git connect`), so
Vercel builds and deploys automatically:

- **Push to `main`** → production deploy (aliased to `crayon-umber.vercel.app`)
- **Open a PR** → unique preview deployment

No GitHub Actions job, no token, no workflow config for deploys.

### Required project setting (one-time, dashboard)

Vercel → `crayon` → Settings → Build & Deployment → **Root Directory = `apps/web`**

This is essential: the Next app lives in `apps/web`, not the repo root. Without
it, Vercel builds the monorepo root (no Next app) and the site never updates —
that's exactly why the live site once sat ~40 days stale. It can't be set from
the CLI; it must be set in the dashboard.

## Manual deploy (break-glass fallback)

`apps/web` is self-contained (own `package-lock.json`, no workspace deps):

```bash
cd apps/web
vercel link --yes --project crayon --scope mithun0524s-projects   # first time only
vercel deploy --prod --yes
```

## Notes

- Build: `next build` (Next 16, Turbopack), ~30s. 17 routes, mostly static.
- `.vercel/` is gitignored — never commit it.
- Deploys are **not** gated on this repo's CI (`ci.yml`). If you ever need
  deploys to wait for green tests, enable Vercel → Settings → Git → "Only deploy
  when checks pass", or switch to a CI-driven `vercel deploy --prebuilt` job.
