For a **2026-grade coding agent**, I'd build it like this:

# 1. Core Tech Stack

## Runtime

```text
TypeScript
Node.js 24+
pnpm
```

Why:

* VSCode ecosystem
* MCP ecosystem
* Better AI SDK support
* Easier tool orchestration

---

## API Layer

```text
Fastify
Zod
OpenAPI
```

Fastify is significantly lighter than Express.

---

## Frontend

```text
Next.js
React
Tailwind
shadcn/ui
TanStack Query
```

---

## Desktop

```text
VSCode Extension
```

Build VSCode first.

Cursor proved that's where developers live.

---

# 2. Agent Framework

Don't use LangChain as your core.

Use:

```text
AI SDK
+
Custom Agent Runtime
```

Possible frameworks:

* [Vercel AI SDK](https://sdk.vercel.ai?utm_source=chatgpt.com)
* [Mastra](https://mastra.ai?utm_source=chatgpt.com)
* [OpenHands](https://github.com/All-Hands-AI/OpenHands?utm_source=chatgpt.com) (study architecture)
* [LangGraph](https://langchain-ai.github.io/langgraph/?utm_source=chatgpt.com) (good ideas, not mandatory)

I'd still build the orchestration layer myself.

---

# 3. Agent Runtime

Think of it as:

```text
Agent Runtime
│
├── Planner
├── Executor
├── Tool Router
├── Memory Manager
├── Context Manager
├── Model Router
└── Evaluator
```

---

# Planner

Input:

```text
Build login system
```

Output:

```json
[
  "Analyze auth flow",
  "Create database schema",
  "Create API routes",
  "Add frontend",
  "Write tests"
]
```

Use:

```text
GPT
Claude
Gemini
```

Only for planning.

---

# Executor

Responsible for:

```text
Read files
Write files
Search files
Run terminal
Git actions
Browser actions
```

ReAct loop:

```text
Think
↓
Tool
↓
Observe
↓
Think
↓
Tool
```

---

# Evaluator

Critical component.

Checks:

```text
Build passes?
Tests pass?
Lint passes?
```

If not:

```text
Re-enter agent loop
```

This is how Claude Code gets surprisingly good.

---

# 4. Code Understanding Engine

Most important subsystem.

---

## Parsing

Use:

```text
Tree-sitter
```

For:

```text
TypeScript
Python
Go
Rust
Java
```

Store:

```json
{
  "functions": [],
  "classes": [],
  "imports": [],
  "exports": []
}
```

---

## Dependency Graph

Create graph:

```text
File A
↓
File B
↓
File C
```

When editing:

```text
Only load affected nodes
```

instead of whole repo.

Huge token savings.

---

# 5. Memory Architecture

Most people do this wrong.

Don't shove everything into a vector DB.

Use 4 memory types.

---

## Working Memory

Current task.

```text
User request
Current files
Recent tool outputs
```

TTL:

```text
Session only
```

---

## Episodic Memory

Past actions.

```text
Fixed auth bug
Installed Prisma
Refactored API
```

Store:

```text
Postgres
```

---

## Semantic Memory

Knowledge.

```text
Project uses Zustand
Uses Prisma
Uses App Router
```

Store:

```text
Qdrant
```

---

## Procedural Memory

Learned workflows.

Example:

```text
When adding API route:
1 Create route
2 Add validation
3 Add tests
```

These become reusable skills.

---

# 6. RAG for Code

Don't use naive embeddings.

Use:

```text
Hybrid Search
```

Combine:

```text
Vector Search
+
Keyword Search
+
AST Search
```

Stack:

```text
Qdrant
BM25
Tree-sitter
```

Pipeline:

```text
Question
↓
Retrieve files
↓
Retrieve symbols
↓
Retrieve dependencies
↓
Build context
```

---

# 7. Tool System

Every tool:

```ts
interface Tool {
 name:string
 description:string
 inputSchema:ZodSchema
 execute()
}
```

Core tools:

```text
readFile
writeFile
editFile
grep
terminal
git
browser
fetch
mcp
```

---

# 8. File Editing Strategy

Avoid:

```text
Rewrite file
```

Use:

```text
AST edits
+
Diff patches
```

Libraries:

```text
ts-morph
recast
jscodeshift
```

Flow:

```text
Find symbol
↓
Modify AST
↓
Generate diff
↓
Apply patch
```

This massively reduces hallucinated edits.

---

# 9. Context Optimization

The biggest cost.

Use layered context.

---

Layer 1

```text
User task
```

Layer 2

```text
Current file
```

Layer 3

```text
Related files
```

Layer 4

```text
Project memory
```

Layer 5

```text
Repo summary
```

Never dump the whole codebase.

---

# 10. Model Router

Route by task.

```text
Planning
→ Claude/GPT

Code Generation
→ Claude

Search
→ Local model

Summaries
→ Small model

Embeddings
→ Embedding model
```

Can reduce costs 50–80%.

---

# 11. Multi-Agent System (Later)

Manager agent:

```text
User Task
```

↓

```text
Architect Agent
```

↓

```text
Backend Agent
Frontend Agent
Database Agent
Testing Agent
```

↓

```text
Reviewer Agent
```

Only do this after MVP.

Many startups over-engineer here.

---

# 12. Sandbox

Never execute on host.

Use:

```text
Docker
```

Eventually:

```text
Firecracker
```

Architecture:

```text
Agent
 ↓
Sandbox
 ↓
Terminal
```

---

# 13. Databases

```text
Postgres   → metadata
Redis      → caching
Qdrant     → vectors
```

Enough for years.

---

# 14. Advanced Optimizations

### Context Compression

Generate:

```text
Repository Summary
Framework Summary
Architecture Summary
```

Store permanently.

---

### Symbol-Level Retrieval

Instead of:

```text
Entire file
```

Retrieve:

```text
Function
Class
Method
```

---

### Incremental Indexing

Index only changed files.

Not:

```text
Entire repo
```

every run.

---

### Reflection Loop

Before execution:

```text
Plan
↓
Self review
↓
Execute
```

After execution:

```text
Result
↓
Critique
↓
Improve
```

Improves success rate noticeably.

---

If your goal is **"better than Claude Code for solo developers"**, the differentiator won't be the model. It will be:

1. **Symbol-aware retrieval (AST + graph based)**
2. **Persistent project memory**
3. **Diff/AST-based editing**
4. **Fast local indexing**
5. **Excellent tool execution reliability**

Those five systems are where 80% of the engineering effort should go.
