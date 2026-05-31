<div align="center">
  <img src="https://img.shields.io/badge/CRAYON-Terminal%20AI-cyan?style=for-the-badge" alt="Crayon AI" />
  <br/>
  <h1>⬡ Crayon</h1>
  <p><strong>The Autonomous Terminal AI</strong></p>
  
  <p>
    <img alt="NPM Version" src="https://img.shields.io/npm/v/@crayon/cli?color=cyan&label=npm&style=flat-square">
    <img alt="Node.js version" src="https://img.shields.io/node/v/@crayon/cli?color=purple&style=flat-square">
    <img alt="License" src="https://img.shields.io/github/license/mithun0524/crayon?color=blue&style=flat-square">
  </p>

  <p>
    An intelligent, autonomous AI coding agent living directly in your terminal. Crayon understands your codebase deeply, plans complex tasks, writes code safely, executes terminal commands, and self-heals errors until the job is completely finished.
  </p>
</div>

---

## ⚡ Features

- **🧠 Autonomous ReAct Loop**: Crayon thinks, plans, and executes. If a test fails or a build breaks, it reads the error and fixes it.
- **🛡️ Secure by Design**: Fine-grained permission modes (`Ask`, `Auto-Edit`, `Auto (God Mode)`). Built-in guards against path traversal, oversized files, and dangerous bash commands (e.g. `rm -rf /`).
- **✨ Beautiful CLI Interface**: Implemented with React for the Terminal (`ink`). Features predictive slash commands, interactive setup wizards, typing animations, and custom syntax-highlighted markdown.
- **🚀 Local Indexer**: Rapid semantic codebase search and dependency graph resolution using a lightweight SQLite backend.
- **🔌 Multi-Provider Support**: First-class support for Anthropic (Claude 3.7 Sonnet), OpenAI, Google (Gemini), and OpenRouter.

## 📦 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g @crayon/cli
```

### Running Crayon

Simply run the agent in any repository:

```bash
crayon chat
```

On your first boot, Crayon will launch a beautiful interactive setup wizard to securely configure your API key, preferred models, default UI theme, and permission boundaries.

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `crayon init` | Initialize the local `.crayon/` configuration and index the repo |
| `crayon index` | Force a fresh re-index of the current workspace |
| `crayon chat` | Launch an interactive agent session |
| `crayon run "<task>"` | Execute a one-shot autonomous task in the background |

Once inside the interactive `chat` interface, you can type `/` to access built-in predictive commands like `/mode` (change permissions), `/files` (view touched files), `/cost` (view token burn), and `/compact` (compress context window).

## 🏗️ Architecture

Crayon is designed as a modular monorepo powered by `pnpm`:

```text
packages/
├── agent/    # The core LLM ReAct loop, planner, memory, and native tools
├── indexer/  # AST extraction, dependency graphs, semantic code search
├── cli/      # The beautiful Ink-based Terminal UI, onboarding, and telemetry
└── vscode/   # (Coming Soon) First-class VS Code IDE Extension
```

## 🔐 Configuration

Configurations are securely stored in `~/.crayon/config.json`.
You can also override via standard environment variables:
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`.

## 📄 License

MIT © [Mithun](https://github.com/mithun0524)
