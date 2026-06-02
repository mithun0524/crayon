<div align="center">
  <img src="https://img.shields.io/badge/CRAYON-Terminal%20AI-cyan?style=for-the-badge&logo=openai" alt="Crayon AI" />
  <br/>
  <br/>
  <img src="./assets/logo.svg" alt="Crayon" width="620">
  <br/>
  <p><strong>The Autonomous AI Coding Agent for your Terminal & IDE</strong></p>
  
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
    <b><a href="#-architecture">Architecture</a></b> •
    <b><a href="#-contributing">Contribute</a></b>
  </p>
</div>

---

## ⚡ Features

- **🧠 Autonomous ReAct Loop**: Crayon thinks, plans, and executes. If a test fails or a build breaks, it intercepts the error and fixes it autonomously.
- **🛡️ Secure by Design**: Fine-grained permission modes (`Ask`, `Auto-Edit`, `Auto (God Mode)`). Built-in safety guards against path traversal, oversized file reads, and destructive bash commands.
- **✨ Beautiful CLI Interface**: Built with React for the Terminal (`ink`). Features predictive autocomplete for slash commands, an interactive onboarding setup wizard, and dynamic native markdown rendering.
- **🎨 Interactive Model Swapping**: Hot-swap between Anthropic, OpenAI, Google, and OpenRouter directly in chat via an inline dropdown menu—without ever leaving your terminal flow.
- **🚀 Advanced Local Indexer**: Rapid semantic codebase search and dependency graph resolution via a blazing-fast local SQLite and Tree-sitter backbone.
- **💾 Auto-Context Compaction**: Keep token burn low with intelligent conversation history compaction (`/compact`) and real-time session cost tracking (`/cost`).
- **🧩 Extensible Architecture**: Integrates universally via Model Context Protocol (MCP) servers and exposes a highly modular TypeScript SDK.

## 📦 Quick Start

### 1. Installation

Install Crayon globally to use it across all your projects:

```bash
# Using npm
npm install -g crayon-cli@latest

# Using pnpm
pnpm add -g crayon-cli@latest
```

*(Alternatively, try it instantly without installing: `npx crayon-cli@latest chat`)*

### 2. Launch the Agent

Navigate to any local codebase and start a session:

```bash
cd your-project
crayon chat
```

**First Boot Experience:** Crayon will launch a beautiful interactive setup wizard to securely configure your API key, preferred models, and permission boundaries. All secrets are stored safely in `~/.crayon/config.json`.

---

## 🛠️ CLI Commands & Usage

| Command | Description |
|---------|-------------|
| `crayon init` | Initialize the local `.crayon/` config and force-index the repository |
| `crayon index` | Force a fresh semantic re-index of the current workspace |
| `crayon chat` | Launch a continuous, interactive agent session |
| `crayon run "<task>"` | Execute a one-shot autonomous background task |

### In-Chat Slash Commands
Once inside the interactive `chat` interface, use the `/` prefix to access predictive commands (navigate with arrow keys & `<Tab>` to autocomplete):
- `/mode` - Hot-swap permission levels (`ask`, `auto-edit`, `plan`, `auto`, `bypass`)
- `/model` - Hot-swap AI models via an inline interactive dropdown or direct argument
- `/config` - Interactive setup wizard to change providers, models, or theme settings
- `/cost` - View real-time token burn and session cost
- `/files` - View files modified during the current session
- `/clear` - Purge the conversation history buffer
- `/compact` - Compress the context window to save tokens

---

## 🏗️ Architecture

Crayon is designed as a highly scalable, modular monorepo managed via `pnpm`:

```text
packages/
├── 🤖 agent/    # Core LLM ReAct loop, planner, memory arrays, and native tool definitions
├── 🔍 indexer/  # AST extraction (Tree-sitter), dependency graphs, and SQLite semantic search
├── 💻 cli/      # The beautiful Ink-based Terminal UI, session state, and onboarding wizard
└── 🔌 vscode/   # First-class VS Code IDE Extension integrating the core agent engine
```

---

## 🗺️ Roadmap

- [x] Core ReAct Agent Loop
- [x] Local AST Codebase Indexer
- [x] Multi-provider Model Support
- [x] Advanced CLI UI (Ink)
- [x] VS Code Extension (Alpha)
- [ ] Model Context Protocol (MCP) Integration Layer
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

Configurations are strictly stored in `~/.crayon/config.json` preventing accidental commits of API keys. 
You can dynamically override keys via standard environment variables:
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`.

---

<div align="center">
  <p>Built with ❤️ for developers. MIT License © <a href="https://github.com/mithun0524">Mithun</a>.</p>
</div>
