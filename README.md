# Crayon

Autonomous AI coding agent — understands your codebase, plans tasks, edits code safely, runs tools, and self-heals until the job is done.

## Quick Start

```bash
pnpm install
pnpm build

# In any project:
pnpm --filter @crayon/cli exec crayon init
pnpm --filter @crayon/cli exec crayon chat
```

## Configuration

Set API keys via environment variables:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
export CRAYON_MODEL=nvidia/nemotron-3-super-120b-a12b:free
export CRAYON_PROVIDER=openrouter
```

Or create `~/.crayon/config.json`:

```json
{
  "provider": "openrouter",
  "defaultModel": "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouterApiKey": "sk-or-v1-..."
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `crayon init` | Initialize `.crayon/` and index the repo |
| `crayon index` | Force re-index the workspace |
| `crayon chat` | Interactive agent session |
| `crayon run "<task>"` | One-shot autonomous task |

## VS Code Extension

```bash
cd packages/vscode
pnpm build
# Press F5 in VS Code to launch Extension Development Host
```

Commands: **Crayon: Chat**, **Crayon: Run Task**, **Crayon: Index Workspace**

## Architecture

```
packages/
├── agent/    # ReAct loop, tools, memory, planner
├── indexer/  # Symbol extraction, dependency graph, hybrid search
├── cli/      # Terminal interface
└── vscode/   # VS Code extension
```

## License

MIT
