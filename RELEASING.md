# Releasing Crayon

## One-time GitHub Setup (already done ✅)

| What | Where | Value |
|---|---|---|
| npm token secret | GitHub → Settings → Secrets → Actions | `NPM_TOKEN` |
| Deployment environment | GitHub → Settings → Environments | `npm` |

---

## How to Release a New Version

Run these 5 commands — the CI/CD does everything else automatically.

```bash
# 1. Bump all 3 packages to the new version (e.g. 0.3.2)
node -e "
const fs = require('fs');
['packages/cli/package.json','packages/agent/package.json','packages/indexer/package.json']
  .forEach(p => { const j = JSON.parse(fs.readFileSync(p,'utf8')); j.version='NEW_VERSION'; fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n'); });
"

# 2. Commit
git add packages/cli/package.json packages/agent/package.json packages/indexer/package.json
git commit -m "chore: release vNEW_VERSION"

# 3. Tag
git tag vNEW_VERSION

# 4. Push everything
git push && git push --tags
```

Replace `NEW_VERSION` with the actual version (e.g. `0.3.2`).

> **Rule:** The git tag must exactly match the version in `packages/cli/package.json`.
> The CI gate will reject mismatches before anything is published.

---

## What the Pipeline Does (automatically)

```
push tag v*
    │
    ▼
verify job ── build + test all packages
    │         if this fails → nothing ships
    │
    ├──────────────────────────┐
    ▼                          ▼
npm-publish               cli-binaries (linux/mac/win)
crayon-indexer                 │
crayon-agent              vscode-extension (.vsix)
crayon-cli                     │
    │                          ▼
    │                    github-release
    │                    (attach binaries + vsix)
    ▼
users: npm install -g crayon-cli
```

---

## Version History

| Version | Date | Notes |
|---|---|---|
| v0.3.1 | 2026-07-10 | First public npm release. Phases 1–6 complete: session mgmt, PTY shell, prompt caching, LSP, git worktree sandboxing, project memory (`/memory`). |
| v0.3.0 | — | Pre-release (not published) |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `401 Unauthorized` on publish | `NPM_TOKEN` secret is missing or expired — regenerate at npmjs.com → Avatar → Access Tokens |
| `403 Forbidden` | Package name taken on npm — rename packages to `@mithun0524/crayon-cli` etc. |
| `Tag does not match version` | Forgot to bump `packages/cli/package.json` before tagging |
| `Environment npm not found` | Create it: GitHub → Settings → Environments → New → `npm` |
| Pipeline skips npm-publish | Check the `npm` environment exists and the job isn't blocked by a reviewer |

---

## Updating the npm Token (when it expires)

1. npmjs.com → Avatar → Access Tokens → delete old → Generate New Token
2. GitHub → Settings → Secrets → Actions → `NPM_TOKEN` → Update
