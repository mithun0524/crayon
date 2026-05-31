# Crayon Architecture

Crayon is designed as a highly modular, multi-package monorepo to separate concerns between the UI, the Agent loop, and codebase intelligence.

## Packages

### 1. `@crayon/agent`
The core reasoning engine.
- **ReAct Loop**: Implements the Thought -> Action -> Observation loop.
- **Tools**: Sandboxed implementations for `edit_ast`, `edit_file`, `terminal`, etc.
- **Memory**: Manages episodic history and compacts token usage.

### 2. `@crayon/indexer`
The local intelligence engine.
- **AST Parser**: Extracts function signatures and class hierarchies.
- **Vector Search**: (Upcoming) LanceDB-powered semantic code search.
- **Dependency Graph**: Maps imports and exports across the repository.

### 3. `@crayon/cli`
The user interface.
- **Ink UI**: A beautiful, React-powered terminal interface.
- **Onboarding**: Animated gradient UI and configuration wizards.
- **Telemetry**: PostHog integration for crash reporting.
