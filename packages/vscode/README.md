# Crayon - Autonomous AI Coding Agent

Crayon is a powerful, autonomous AI coding agent right inside VSCode. It helps you write, edit, and understand code faster through intelligent planning and autonomous execution.

## Features

- **Chat Interface**: Talk to Crayon to explore your codebase, answer questions, and debug issues.
- **Autonomous Tasks**: Ask Crayon to build entire features, and it will plan, execute, and verify the changes automatically.
- **MCP Server**: Integrated Model Context Protocol support allows Crayon to expose tools for other agents and systems.
- **Theme Support**: Includes light and high-contrast theme support out of the box.

## Requirements

You will need an API key from one of the supported providers (Anthropic, OpenAI, OpenRouter, Google).

## Extension Settings

This extension contributes the following settings:

* `crayon.provider`: Select your LLM provider (openrouter, anthropic, openai, google)
* `crayon.defaultModel`: Set the default model for agent tasks.
* `crayon.autoApplyEdits`: Toggle whether file edits are applied immediately or need approval.
* `crayon.anthropicApiKey`: Set your Anthropic API key.
* `crayon.openaiApiKey`: Set your OpenAI API key.
* `crayon.openrouterApiKey`: Set your OpenRouter API key.
* `crayon.googleApiKey`: Set your Google API key.

## Known Issues

- Initial indexing may take some time on very large repositories.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for details on changes in this release.
