# Deploying the marketing site (`apps/web`)

The site lives at **https://crayon-umber.vercel.app** (Vercel project `crayon`,
scope `mithun0524s-projects`).

## TL;DR — manual deploy

`apps/web` is self-contained (its own `package-lock.json`, no workspace deps),
so it deploys standalone from this directory:

```bash
cd apps/web
vercel link --yes --project crayon --scope mithun0524s-projects   # first time only
vercel deploy --prod --yes
```

The `--prod` deploy is auto-aliased to `crayon-umber.vercel.app`.

## Make it automatic (recommended, dashboard-only)

Pushing to `main` does **not** deploy until the Vercel project is configured for
this monorepo. These are project settings — they can't be set from the CLI:

1. **Root Directory** → `apps/web`
   Vercel → `crayon` → Settings → Build & Deployment → Root Directory.
   Without this, Vercel builds the repo root (a pnpm monorepo with no Next app)
   and the site never updates.
2. **Git** → connect `mithun0524/crayon`, Production Branch = `main`.
   Vercel → `crayon` → Settings → Git.

Once both are set, every push to `main` triggers a production deploy and the
manual step above is only a fallback.

## Notes

- Build: `next build` (Next 16, Turbopack), ~30s. 17 routes, mostly static.
- `.vercel/` is gitignored — don't commit it.
- History gotcha (2026-07): the project had Root Directory unset and Git
  auto-deploy off, so the live site was ~40 days stale despite merges. Fixed by
  a manual CLI deploy; set the two dashboard options above to prevent a repeat.
