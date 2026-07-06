# Changelog

## 0.3.0 — harness hardening, security audit, TUI reskin

A large reliability + security + UX pass, validated by live dogfooding against a
local model (Ollama) and a new pseudo-terminal end-to-end test suite.

### Features
- **Headless JSON mode** — `crayon run <task> --json` prints a single machine-readable
  result object (success, summary, edits, steps, toolCalls, tokens, duration); exit
  codes 0/1/2. Scriptable/CI-friendly.
- **Per-session resume** — every chat is saved to `.crayon/sessions/<id>.json`;
  `crayon sessions` lists them, `crayon chat --resume [id]` restores memory **and** the
  visible transcript and continues under the same id.
- **Plan-approve workflow** — in plan mode the agent produces a read-only implementation
  plan; a gate then offers Execute / Keep planning / Discard before any file is touched.
- **Custom slash commands** — `.crayon/commands/*.md` (workspace) and `~/.crayon/commands`
  (global) become `/name` commands with `$ARGUMENTS` expansion.
- **Configurable verification** — `verifyCommand` (config or `CRAYON_VERIFY_CMD`) runs
  exactly your command after edits; `"none"` disables; unset auto-detects.
- **Opt-in auto-commit** — `autoCommit` commits each successful task's edited files with a
  generated message (`--` guarded; never `git add .`).
- **Background terminal** — `terminal(background:true)` runs dev servers / watchers detached
  and returns the pid, so the agent can start and serve a running app itself.
- **`/color`** — switch the accent live from 12 presets; gradient CRAYON logo on boot.

### Security (audit-driven)
- **`repl` tool gated** — was arbitrary Node/Python execution with no permission check (RCE
  in every mode, including plan); now denied in plan mode and requires approval otherwise.
- **Non-TTY no longer blanket-approves** — CI/pipe runs previously auto-approved every
  command incl. dangerous ones; now the permission mode decides and prompts are denied.
- **`web_fetch` SSRF blocked** — http(s) only, private/loopback/link-local (incl. cloud
  metadata 169.254) rejected via DNS resolution, revalidated on every redirect.
- **Terminal denylist hardened** — shell operators / redirects / command substitution /
  inline env-assignment flagged, and the dangerous-binary list expanded.
- **Argument-injection closed** — git `add`/`commit` use `--`; `resolvePath` rejects
  option-like (`-`-prefixed) filenames.
- **MCP subprocesses** no longer inherit the full environment (leaked LLM API keys) — minimal
  allowlisted env only.
- **Sub-agent delegation fixed** — `spawn_agent` was a stub with no model/credentials.

### Reliability
- Fixed a hang where a stray space in the model id produced an unresolvable request.
- Bounded post-stream metadata awaits + a stream idle-timeout so a dead/slow provider can't
  hang "Working" forever; empty responses report an honest quota error instead of a fake success.
- Retry transient provider errors (503/5xx/429) with backoff; fail fast on hard quota 429s.
- `edit_file` whitespace-insensitive fallback + read-then-edit guidance + a one-shot
  "no edits" corrective nudge (big robustness win for weaker models).
- `resolvePath` canonicalizes the workspace root (fixes absolute-path edits on macOS).
- Slim chat-mode prompt: a greeting now replies in ~1s instead of ~6s.
- Strip leaked tool-call JSON from user-facing replies; normalize edited paths to relative.

### TUI (Claude Code-style reskin)
- Native scrollback via `<Static>` with a one-time screen clear on start; clean exit.
- Inline `/` command menu driven by the single input (no double input box), 3-row scroll.
- `⏺` bullets, literal tool lines, neutral crayon-teal accent, braille spinner (no jitter).
- Double-tap Ctrl+C: first interrupts (clean rollback + clears the queue), second quits.
- Streaming rendered raw then finalized as markdown once; deltas batched.

### Bundle / packaging
- Fixed duplicate `createRequire` and an unresolvable `react-devtools-core` import that
  crashed the CLI on boot. `@ai-sdk/google` kept external (bundling made Gemini ~10× slower).

### Tests
- New PTY end-to-end suite drives the real binary in a pseudo-terminal (`@lydell/node-pty`).
- 68 tests across the workspace; typecheck clean on all packages.
