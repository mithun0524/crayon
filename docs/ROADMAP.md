# Crayon — Full Roadmap
### From MVP → Production-Grade Autonomous Coding Agent

> **Vision:** An autonomous software engineer that understands an entire codebase,
> plans tasks, modifies code safely, executes tools, tests changes, and iterates
> until completion. Not an AI wrapper — a real engineering partner.

---

## Where We Are Today

```
✅ Core agent loop (streamText, tool calling, eval-retry)
✅ Repository indexing (symbol parser, hybrid search, ripgrep)
✅ File editing tools (edit_file, edit_ast, write_file, overwrite_file)
✅ Terminal tool (run_terminal, with approveCommand)
✅ Git integration (status, diff, commit, log)
✅ Episodic memory (task history, outcomes)
✅ Working memory (per-session context)
✅ MCP tool support
✅ VSCode extension (chat panel, diff preview, streaming)
✅ CLI (run + chat modes)
✅ Multi-provider support (Anthropic, OpenAI, OpenRouter, Gemini)
✅ Persistent agent session in VSCode
✅ autoApplyEdits, approveEdit flow
```

**What we are NOT yet:**
- Context-aware (doesn't deeply understand what it's touching before touching it)
- Self-correcting at scale (5-retry eval loop is shallow)
- Fast (full re-index on every run)
- Transparent (users can't see *why* the agent made decisions)
- Distributable (no packaged extension, no npm binary)

---

## Phase 1 — Foundation ✅ DONE
> *Build the skeleton. Prove it can run.*

- [x] Monorepo setup (`crayon-agent`, `crayon-indexer`, `crayon-cli`, `crayon-vscode`)
- [x] `CrayonAgent` class with `generateText` / `streamText` loop
- [x] File tools: read, edit, write, overwrite, AST edit
- [x] Terminal tool with sandboxed approval
- [x] Git tools
- [x] Symbol parser (TS/JS, Python, Go)
- [x] Hybrid search (BM25 + ripgrep)
- [x] Episodic + working memory
- [x] VSCode webview chat panel
- [x] CLI run + chat commands
- [x] Multi-provider model router

**Exit criteria:** Agent can read files, make edits, run terminal, and respond to natural language task descriptions.

---

## Phase 2 — Core Quality ✅ DONE
> *Fix the sharp edges. Make it reliable.*

- [x] Switch `generateText` → `streamText` (real-time token streaming)
- [x] `edit_ast` ClassName.methodName dot-notation for class methods
- [x] `overwrite_file` tool for large file rewrites
- [x] Gemini / Google provider support
- [x] `autoApplyEdits` VSCode setting properly wired
- [x] Persistent agent session (one agent per workspace, history survives)
- [x] VSCode streaming UI (live bubble, stop/clear buttons)
- [x] Build + test passing (7/7)

**Exit criteria:** Agent works end-to-end, streaming is live, edits are safe, settings are respected.

---

## Phase 3 — UX/UI Polish
> *Make it feel like a pro tool, not a hackathon demo.*

### 3A — CLI TUI with `ink`
Replace `ora` + `chalk` with React-for-terminals.

- [ ] Install `ink`, `@inkjs/ui`, `ink-spinner`, `ink-text-input`
- [ ] `<App>` component: plan steps list, live streaming text, spinner per step
- [ ] Inline unified diff rendering in terminal (color-coded +/- lines)
- [ ] Escape-to-interrupt: gracefully stop agent, print summary of what was done
- [ ] Slash commands in chat mode:
  - `/clear` — reset conversation
  - `/diff` — show all edits made this session as unified diff
  - `/cost` — show estimated token usage + cost
  - `/compact` — summarize history to save context window
  - `/files` — list files touched this session
- [ ] Token + cost counter (from `streamText` `usage` field)
- [ ] Per-step status column: `✓ done`, `● running`, `○ pending`
- [ ] Git status line at bottom (branch, dirty files count)

**What it looks like:**
```
╭─ Crayon ─────────────────────────────────────────╮
│ workspace: ~/projects/myapp   branch: main  3↑   │
├──────────────────────────────────────────────────┤
│ Task: add rate limiting to the API middleware     │
│                                                   │
│ Plan                                              │
│  ✓  1. Read src/middleware/auth.ts                │
│  ●  2. Implement rate limiter using ioredis       │
│  ○  3. Add tests                                  │
│  ○  4. Run test suite                             │
│                                                   │
│ src/middleware/rateLimit.ts  [new]                │
│ + import Redis from 'ioredis'                     │
│ + export const rateLimiter = ...                  │
│                                                   │
│ The rate limiter uses a sliding window algor▋     │
│                                                   │
│ tokens: 4,821 / 200k   ~$0.003          esc stop │
╰──────────────────────────────────────────────────╯
```

### 3B — VSCode Panel Polish
- [ ] Markdown rendering in chat bubbles (marked.js bundled)
- [ ] Syntax-highlighted code blocks (highlight.js, VSCode theme-aware)
- [ ] Collapsible tool call cards (click to expand args + result)
- [ ] Inline diff viewer embedded in panel (not opening a separate editor tab)
- [ ] File breadcrumbs on edit events (clickable → opens file)
- [ ] Token counter + cost in header
- [ ] Session export (copy full conversation as markdown)
- [ ] Model selector dropdown in panel header
- [ ] Thinking/reasoning display (for Claude extended thinking)

**What it looks like:**
```
┌─ ⬡ Crayon ──────────── claude-sonnet · 4.2k tok ─ [Clear] ─┐
│                                                              │
│  ▶ read_file  src/middleware/auth.ts          [+] expand     │
│  ▶ write_file src/middleware/rateLimit.ts     [+] expand     │
│                                                              │
│  ┌──── src/middleware/rateLimit.ts ─────────────────────┐   │
│  │ - // placeholder                                     │   │
│  │ + import Redis from 'ioredis'                        │   │
│  │ + export const rateLimiter = rateLimit({ ... })      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  The rate limiter uses a **sliding window** algorithm:       │
│                                                              │
│  ```typescript                                               │
│  const limiter = new RateLimiter({                           │
│    points: 100,  // requests per minute                      │
│  });                                                         │
│  ```                                                         │
│                                                              │
│  ✓ Tests passed  (3 new, 0 failed)                          │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐  [■ Stop]          │
│ │ Ask Crayon...                        │                    │
│ └──────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

**Exit criteria (Phase 3):** A non-technical observer watching a recording of Crayon says "this looks like a real product."

---

## Phase 4 — Deep Code Intelligence
> *The agent must understand code, not just text.*

This is the phase that separates real coding agents from chat wrappers.

### 4A — Semantic Code Search (RAG)
- [ ] Embed code chunks with a local embedding model (or OpenAI `text-embedding-3-small`)
- [ ] Store vectors in LanceDB — zero-dependency, works offline, no server needed
- [ ] Hybrid retrieval: BM25 keyword + vector similarity → reranked results
- [ ] Chunk strategy: function/class boundaries (not fixed token windows)
- [ ] Incremental updates: only re-embed changed files (use existing `mtime` + hash)
- [ ] `search_code` tool exposes semantic search to the agent

### 4B — Symbol Dependency Graph
- [ ] Build import/export dependency graph across all files
- [ ] When agent reads a file, auto-load its direct dependencies as context
- [ ] Impact analysis: when editing symbol X, surface what calls X
- [ ] `find_usages` tool: find all call sites of a function/class
- [ ] `get_dependents` tool: what files import this module?

### 4C — Smarter Context Management
- [ ] Layered context budget (system prompt, repo intel, working memory, conversation)
- [ ] `/compact` — summarize conversation history using a fast cheap model
- [ ] Smart truncation: drop old tool results first, keep code context
- [ ] Context window warning when > 80% full
- [ ] Auto-compact triggered when approaching limit

### 4D — Better Symbol Parser
- [ ] Replace regex parser with tree-sitter for accurate AST parsing
- [ ] Support more languages: Rust, Java, C/C++, Ruby, Swift, Kotlin
- [ ] Extract function signatures, docstrings, type annotations
- [ ] Track class hierarchy (extends, implements)

**Exit criteria (Phase 4):** Agent can navigate a 50k+ line codebase, find the right files for a task without being told, and understand the impact of its changes before making them.

---

## Phase 5 — Advanced Agent Loop
> *The agent should think before it acts, and verify after.*

### 5A — Hierarchical Planning
- [ ] Two-phase execution: Plan → Approve → Execute (not just classify + go)
- [ ] User can edit the plan before execution starts
- [ ] Plan persistence: save to `.crayon/plans/` so it survives crashes
- [ ] Sub-task decomposition: break large tasks into independently-testable chunks
- [ ] Rollback on failure: `git stash` before starting, pop on unrecoverable error

### 5B — Stronger Evaluator / Self-Healing
- [ ] Detect project test runner automatically (vitest, jest, pytest, cargo test, go test)
- [ ] Run affected tests only (not full suite) using dependency graph
- [ ] TypeScript/ESLint error detection as a pre-check before running tests
- [ ] Up to N self-healing retries with exponential backoff
- [ ] Failure categorization: syntax error vs test logic vs environment
- [ ] Human-in-the-loop escalation: "I've tried 3 times and can't fix this. Here's what I found."

### 5C — Branch-Per-Task Git Workflow
- [ ] `git_create_branch` tool: create feature branch for each task
- [ ] `git_push` tool: push branch when done
- [ ] Auto-commit after each successful eval pass
- [ ] PR description generation from task + diff

### 5D — Sandboxed Code Execution
- [ ] Docker container execution for untrusted terminal commands
- [ ] File system isolation: agent writes to a temp copy, diffs applied after approval
- [ ] Timeout limits on terminal tool (configurable, default 30s)
- [ ] Command allowlist/denylist

### 5E — Long-Running Task Management
- [ ] Tasks saved to `.crayon/tasks/<id>.json` with full state
- [ ] Resume interrupted tasks: `crayon resume <task-id>`
- [ ] Task queue: `crayon queue "task 1" "task 2"` runs sequentially
- [ ] Background mode: agent runs detached, notifies on completion
- [ ] Local web dashboard: `crayon web` → http://localhost:3737

**Exit criteria (Phase 5):** Agent handles a 30+ step task, survives interruption and resumes, self-corrects through 5+ test failure cycles without help.

---

## Phase 6 — Distribution & Ecosystem
> *Ship it. Let others use it.*

### 6A — CLI as a Proper Binary
- [ ] Package with `bun build --compile` → single executable, no Node required
- [ ] Publish `crayon` to npm: `npx crayon run "add authentication"`
- [ ] Homebrew formula for Mac/Linux
- [ ] Windows installer (`.msi` via `wix`)
- [ ] Shell completion (bash, zsh, fish, PowerShell)
- [ ] `crayon config` wizard: interactive setup for API keys + model

### 6B — VSCode Extension Publishing
- [ ] Proper icon, branding, marketplace screenshots
- [ ] Demo GIF in README
- [ ] Publish to VS Marketplace + Open VSX (for Cursor/Windsurf/Zed)
- [ ] Auto-update mechanism
- [ ] Opt-in anonymous telemetry

### 6C — MCP Server Mode
- [ ] `crayon serve` — expose Crayon as an MCP server
- [ ] Any MCP-compatible client (Claude Desktop, Zed, etc.) can use Crayon's tools
- [ ] Exposed tools: `edit_file`, `run_terminal`, `search_code`, `find_usages`

### 6D — Plugin System
- [ ] Plugin API: `crayon.registerTool({ name, description, execute })`
- [ ] Plugin discovery from `.crayon/plugins/`
- [ ] Community plugin registry

### 6E — Web Interface
- [ ] `crayon web` → local React app at http://localhost:3737
- [ ] Full feature parity with VSCode panel
- [ ] Works without VS Code (for non-VS Code users)

**Exit criteria (Phase 6):** Someone new installs Crayon and uses it productively within 5 minutes, with zero manual setup beyond an API key.

---

## Capability Comparison

| Feature | Now | Ph3 | Ph4 | Ph5 | Ph6 |
|---|---|---|---|---|---|
| Token streaming | VSCode only | CLI + VSCode | ✅ | ✅ | ✅ |
| Inline diff | ❌ | CLI + panel | ✅ | ✅ | ✅ |
| Semantic search | ❌ | ❌ | ✅ | ✅ | ✅ |
| Symbol graph | ❌ | ❌ | ✅ | ✅ | ✅ |
| Impact analysis | ❌ | ❌ | ✅ | ✅ | ✅ |
| Plan editing | ❌ | ❌ | ❌ | ✅ | ✅ |
| Self-healing | shallow | shallow | better | deep | deep |
| Branch workflow | ❌ | ❌ | ❌ | ✅ | ✅ |
| Multi-language | TS/JS/Py/Go | same | tree-sitter | all | all |
| Context mgmt | basic | /compact | smart | layered | layered |
| Resume tasks | ❌ | ❌ | ❌ | ✅ | ✅ |
| npm install | ❌ | ❌ | ❌ | ❌ | ✅ |
| VSCode published | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Who We're Competing Against

| Product | Their edge | Our path to beat them |
|---|---|---|
| **Claude Code** | Anthropic-native, brand, polished TUI | Match TUI quality (Ph3), beat on openness + multi-provider |
| **Cursor** | VSCode fork, full IDE control | Beat on autonomy — they autocomplete, we *execute* |
| **GitHub Copilot** | Inline suggestions, GH integration | Beat on task-level autonomy, multi-file reasoning |
| **Aider** | Battle-tested, git-native, CLI | Beat on UX, streaming, VSCode integration |
| **Devin** | Full computer use, async tasks | Long-term target: Ph5 task queue + web dashboard |

**Our moat:** Open source · multi-provider · autonomous (not suggestion-based) · extensible via MCP · deeply VSCode integrated

---

## Open Tech Decisions

| Decision | Options | Recommendation |
|---|---|---|
| Vector store | LanceDB, ChromaDB, FAISS | **LanceDB** — zero deps, local, TypeScript-native |
| Embeddings | OpenAI, Cohere, nomic-embed-text | **nomic-embed-text** offline, OpenAI for quality |
| AST parser | tree-sitter, ts-morph | **tree-sitter** multi-lang + keep ts-morph for TS edits |
| CLI TUI | ink, blessed, charm.sh | **ink** — React model, TypeScript-native |
| Task persistence | JSON files, SQLite | **SQLite** (better-sqlite3) — queryable, ACID |
| Sandbox | Docker, Deno, VM2 | **Docker** for real isolation |
| Web UI | Vite + React, plain HTML | **Vite + React** if we build it |

---

## Immediate Next Steps

```
This week → Phase 3A (CLI ink TUI)
  □ install ink + @inkjs/ui
  □ <CrayonApp> component with plan list + live streaming
  □ inline diff rendering
  □ escape-to-interrupt

This week → Phase 3B (VSCode panel polish)
  □ bundle marked.js + highlight.js in webview
  □ render markdown in agent bubbles
  □ collapsible tool call cards

Next week → Phase 4A (semantic search)
  □ install lancedb
  □ embed code chunks on index
  □ search_code tool
```

---

*Last updated: 2026-05-30*
*Current status: Phase 2 complete → entering Phase 3*
