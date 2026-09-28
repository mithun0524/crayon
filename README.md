<div align="center">
  <img src="https://img.shields.io/badge/CRAYON-Terminal%20AI-cyan?style=for-the-badge&logo=openai" alt="Crayon AI" />
  <br/>
  <br/>
  <img src="./assets/crayon-logo.svg?v=4" alt="Crayon" width="620">
  <br/>
  <p><strong>The Autonomous AI Coding Agent for your Terminal & IDE</strong></p>
  <p><strong>Live Demo:</strong> <a href="https://crayon-umber.vercel.app/">https://crayon-umber.vercel.app/</a></p>
  
  <p>
    <a href="https://www.npmjs.com/package/crayon-cli"><img alt="NPM Version" src="https://img.shields.io/npm/v/crayon-cli?color=cyan&label=npm&style=flat-square&logo=npm"></a>
    <a href="https://www.npmjs.com/package/crayon-vscode"><img alt="VS Code Extension" src="https://img.shields.io/npm/v/crayon-vscode?color=blue&label=vscode&style=flat-square&logo=visualstudiocode"></a>
    <img alt="Node.js version" src="https://img.shields.io/node/v/crayon-cli?color=purple&style=flat-square&logo=nodedotjs">
    <a href="https://github.com/mithun0524/crayon/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/mithun0524/crayon?color=green&style=flat-square"></a>
    <a href="https://github.com/mithun0524/crayon/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/mithun0524/crayon?style=flat-square&logo=github"></a>
  </p>

  <p>
    Crayon is an intelligent, autonomous AI pair programmer that lives directly in your workspace. It understands your codebase deeply, plans complex architectural changes, executes terminal commands, and self-heals errors until the job is completely finished.
  </p>
  
  <p>
    <b><a href="#-quick-start">Get Started</a></b> •
    <b><a href="#-features">Features</a></b> •
    <b><a href="#-vs-code-extension">VS Code</a></b> •
    <b><a href="#-architecture">Architecture</a></b> •
    <b><a href="#-contributing">Contribute</a></b>
  </p>
</div>

---

## ⚡ Features

- **🧠 Autonomous ReAct Loop**: Crayon thinks, plans, and executes. If a test fails or a build breaks, it intercepts the error and fixes it autonomously.
- **🛡️ Secure by Design**: Five permission modes (`ask`, `auto-edit`, `plan`, `auto`, `bypass`) — even `auto` still asks before anything risky. Built-in safety guards against path traversal, oversized file reads, destructive or chained shell commands, and SSRF on outbound fetches.
- **✨ Beautiful CLI Interface**: Built with React for the Terminal (`ink`). Features predictive autocomplete for slash commands, an interactive onboarding setup wizard, and dynamic native markdown rendering.
- **🧩 First-Class VS Code Extension**: A transparency-first chat panel with live reasoning, a "Read N files" progress accordion, tool cards with status + timing, inline `path:line` citations that jump to source, code blocks with Copy / Insert-at-cursor, slash commands, context pills, and follow-up suggestion chips.
- **🎨 Interactive Model Swapping**: Hot-swap between Anthropic, OpenAI, Google, OpenRouter, and local **Ollama** models directly in chat—without ever leaving your flow.
- **🔒 Local & Private**: Point Crayon at a local Ollama server for fully offline, zero-cost runs with no API key required — or use **Ollama Cloud** models (`qwen3-coder:480b-cloud`, `gpt-oss:120b-cloud`) with no GPU.
- **🚀 Advanced Local Indexer**: Rapid semantic codebase search and dependency graph resolution via a blazing-fast local SQLite and Tree-sitter backbone.
- **🗺️ Codebase-Aware Q&A**: The `explain_codebase` tool gives the agent an instant structured overview—stack, README, layout, scripts, and dependency hub files—so broad questions get grounded answers instead of guesses.
- **💾 Auto-Context Compaction**: Keep token burn low with intelligent conversation history compaction (`/compact`) and real-time session cost tracking (`/cost`).
- **🔌 Extensible Architecture**: Integrates universally via Model Context Protocol (MCP) servers and exposes a highly modular TypeScript SDK.

## 📦 Quick Start

### 1. Installation

Install Crayon globally to use it across all your projects:

```bash
# Using npm
npm install -g crayon-cli@latest

# Using pnpm
pnpm add -g crayon-cli@latest
```

*(Alternatively, try it instantly without installing: `npx crayon-cli@latest`)*

### 2. Launch the Agent

Navigate to any local codebase and start a session:

```bash
cd your-project
crayon
```

**First Boot Experience:** Crayon launches a short setup wizard: pick a provider and model (it lists the models installed on your Ollama server, local and cloud), paste an API key or leave it blank to use the environment variable, and choose a default permission mode. Settings are stored in `~/.crayon/config.json`.

**No API key? Use Ollama:**

```bash
ollama pull qwen3-coder:30b                          # local, ~19 GB
ollama signin && ollama pull qwen3-coder:480b-cloud  # Ollama Cloud, no GPU
crayon                                               # pick "Ollama" in the wizard
```

---

## 🛠️ CLI Commands & Usage

| Command | Description |
|---------|-------------|
| `crayon` | Launch an interactive agent session (same as `crayon chat`) |
| `crayon chat --resume [id]` | Resume the most recent session, or a specific one |
| `crayon run "<task>"` | Execute a one-shot autonomous task |
| `crayon run --json "<task>"` | Headless mode for scripts/CI: prints one JSON result (summary, edits, tool calls, tokens) |
| `crayon sessions` | List saved chat sessions for this workspace |
| `crayon init` | Initialize the local `.crayon/` folder and index the repository |
| `crayon index` | Force a fresh semantic re-index of the current workspace |
| `crayon config` | Re-run the setup wizard (provider, model, API key) |
| `crayon mcp add\|list\|remove` | Manage MCP servers |
| `crayon serve` | Expose Crayon itself as an MCP server on stdio |
| `crayon update` | Update to the latest version |

`chat` and `run` both take `-m, --mode <mode>` to override the permission mode for that session.

### Permission Modes
| Mode | File edits | Shell commands |
|------|-----------|----------------|
| `ask` | ask | ask |
| `auto-edit` | apply | ask |
| `plan` | none — proposes a plan, then offers to execute it | none |
| `auto` | apply | run safe ones (tests, `git status`/`diff`/`log`, …); ask for anything risky, chained, or outside the workspace |
| `bypass` | apply | run everything |

Cycle modes with **Shift+Tab** (or Ctrl+T). In an approval prompt: **y** accept · **a** always allow that exact command this session · **n** reject. For file edits, **h** reviews hunk by hunk.

### In-Chat Slash Commands
Once inside the interactive `chat` interface, use the `/` prefix to access predictive commands (navigate with arrow keys & `<Tab>` to autocomplete):
- `/model [name]` - Switch models via an inline picker or direct argument
- `/mode [mode]` - Switch permission mode (picker when no argument)
- `/config` - Settings menu: model, mode, theme, accent color
- `/theme`, `/color` - UI theme (`dark`, `light`, `high-contrast`) and accent color
- `/cost` - Token usage, duration, and cost for the session
- `/files`, `/diff`, `/status` - Files changed this session, git diff, git status
- `/undo` - Rewind the conversation by one turn
- `/clear`, `/compact` - Clear history, or compress it to save tokens
- `/resume` - Pick up a previous session in this workspace
- `/memory` - Generate or refresh project memory (`AGENTS.md`)
- `/copy [code]` - Copy the last answer (or its code block) to the clipboard
- `/mcp` - Browse configured MCP servers and their tools
- `/easel` - See which files are in the agent's context
- `/tui`, `/img <path>` - Switch renderer; render an image inline (iTerm2/WezTerm)
- `/help`, `/exit`

Type `@` to mention a file, `?` for keyboard shortcuts. Project-specific commands live in `.crayon/commands/*.md`.

---

## 🧩 VS Code Extension

Crayon ships as a first-class VS Code extension that embeds the same agent engine in a **transparency-first chat panel** — you always see what the agent is thinking, reading, and doing.

**Install:** grab the latest `.vsix` from [Releases](https://github.com/mithun0524/crayon/releases) and run:

```bash
code --install-extension crayon-vscode-<version>.vsix
```

Open the Crayon panel from the Activity Bar (or `Crayon: Chat` in the command palette), then run **`Crayon: Set API Key`** to store credentials securely (VS Code SecretStorage — never synced in plain text). No key is needed when using a local Ollama model.

**Panel highlights:**
- **Agent transparency** — a live "✻ Thinking" block streams reasoning and auto-collapses; consecutive file reads fold into a `Read N files` accordion with clickable links; tool calls render as cards with a spinner → ✓/✗ and timing.
- **Inline citations** — `path/to/file.ts:42` references in answers become badges that jump straight to that line.
- **Code actions** — every code block has a language label plus **Copy** and **Insert at Cursor**.
- **Slash commands & context** — `/explain`, `/fix`, `/test`, `/doc`, `/refactor`, `/clear`; dismissible context pills show the active file/selection sent with each prompt.
- **Follow-up chips** — one-click suggested next steps after each response.
- **Diff-first edits** — file edits show `+N −M` stats and an optional review-before-apply diff (toggle `crayon.autoApplyEdits`).

Configure the provider and model via the `crayon.*` settings (`crayon.provider`, `crayon.defaultModel`); the conversation persists across window reloads.

---

## 🏗️ Architecture

Crayon is designed as a highly scalable, modular monorepo managed via `pnpm`:

```text
packages/
├── 🤖 agent/    # Core LLM ReAct loop, planner, memory arrays, and native tool definitions
├── 🔍 indexer/  # AST extraction (Tree-sitter), dependency graphs, and SQLite semantic search
├── 💻 cli/      # The beautiful Ink-based Terminal UI, session state, and onboarding wizard
└── 🔌 vscode/   # First-class VS Code IDE Extension integrating the core agent engine
apps/
└── 🌐 web/      # Marketing site & live demo (Next.js)
```

CI/CD runs on GitHub Actions: change-aware parallel per-package build/typecheck/test on every PR, and a tag-driven release pipeline that publishes to npm (with provenance), builds cross-platform CLI bundles, and packages a self-contained VSIX.

---

## 🗺️ Roadmap

- [x] Core ReAct Agent Loop
- [x] Local AST Codebase Indexer
- [x] Multi-provider Model Support (incl. local Ollama)
- [x] Advanced CLI UI (Ink)
- [x] VS Code Extension with agent-transparency UX
- [x] Model Context Protocol (MCP) Integration Layer
- [ ] Browser Automation Tools (Playwright/Puppeteer)
- [ ] Multi-agent Swarm Architecture

---

## 🤝 Contributing

We welcome contributions to make Crayon the absolute best open-source AI agent! 

1. **Fork** the repository
2. **Clone** it locally (`git clone https://github.com/mithun0524/crayon.git`)
3. **Install Dependencies** (`pnpm install`)
4. **Create a branch** (`git checkout -b feature/amazing-feature`)
5. **Commit your changes** (`git commit -m 'feat: add amazing feature'`)
6. **Push and open a PR**

> **Note:** Please ensure you run `pnpm run build` and `pnpm run typecheck` before submitting pull requests.

## 🔐 Configuration & Security

**CLI:** configuration is stored in `~/.crayon/config.json`, preventing accidental commits of API keys. Override keys via standard environment variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`. Point at an Ollama server with `OLLAMA_BASE_URL` (defaults to `http://localhost:11434`).

Other overrides: `CRAYON_PROVIDER`, `CRAYON_MODEL`, `CRAYON_THEME`, `CRAYON_ACCENT`, `CRAYON_VERIFY_CMD` (post-edit check, `none` to disable), `CRAYON_AUTO_COMMIT=1`, `CRAYON_DISABLE_TELEMETRY=1`, and `CRAYON_DEBUG=1` for diagnostics (e.g. language-server logs).

**Per-project state** (index, sessions, backups, the agent's scratchpad) lives in `<repo>/.crayon/`, which git-ignores itself — only `.crayon/commands/` is meant to be committed.

**VS Code:** run `Crayon: Set API Key` to store credentials in the editor's encrypted SecretStorage (never synced in plain text); `crayon.*` settings and environment variables act as fallbacks.

---

<div align="center">
  <p>Built with ❤️ for developers. MIT License © <a href="https://github.com/mithun0524">Mithun</a>.</p>
</div>
