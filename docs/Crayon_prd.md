If you're serious about building a Cursor/Claude Code competitor, your PRD should not be "AI coding assistant."

Your PRD should be:

> **"An autonomous software engineer that understands an entire codebase, plans tasks, modifies code safely, executes tools, tests changes, and iterates until completion."**

---

# PRD v1.0 — Project Codename: Forge

## Vision

Build an AI software engineer capable of:

* Understanding large repositories
* Planning implementation tasks
* Writing production-grade code
* Running commands
* Debugging failures
* Creating pull requests
* Learning project conventions
* Working autonomously

---

# Problem

Current coding assistants:

### GitHub Copilot

* Autocomplete only
* Weak project understanding

### Cursor

* Great context
* Limited autonomy

### Claude Code

* Powerful
* Terminal-focused
* Weak persistent memory

### OpenHands

* Autonomous
* Heavy infrastructure

Developers still spend time:

* Finding files
* Understanding codebases
* Refactoring
* Fixing bugs
* Writing boilerplate
* Testing changes

---

# Solution

Forge acts as a software engineer.

User:

```text
Add Google Authentication
```

Forge:

```text
1. Analyze project
2. Find auth system
3. Create plan
4. Edit files
5. Install packages
6. Run tests
7. Fix failures
8. Generate summary
```

without manual intervention.

---

# Target Users

### Phase 1

* Solo developers
* Indie hackers
* Students

### Phase 2

* Startups
* Agencies

### Phase 3

* Enterprise teams

---

# Core Features

## 1. Repository Intelligence

Agent understands:

```text
Folder structure
Dependencies
Framework
Architecture
Coding standards
Git history
```

Output:

```json
{
  "framework": "Next.js",
  "database": "Postgres",
  "auth": "NextAuth",
  "state": "Zustand"
}
```

---

## 2. Context Engine

Instead of sending:

```text
Entire repository
```

Agent retrieves:

```text
Relevant files
Relevant functions
Relevant imports
Relevant dependencies
```

Goal:

```text
95% token reduction
```

---

## 3. Planning Engine

Every task becomes:

```text
Goal
↓
Subtasks
↓
Execution Plan
```

Example:

```text
Add Stripe Checkout

1. Install Stripe SDK
2. Create API route
3. Add checkout button
4. Add webhook
5. Test flow
```

---

## 4. Autonomous Execution

Tools:

```text
Filesystem
Terminal
Git
Browser
Database
API Calls
```

Agent can:

```text
Read files
Write files
Run npm install
Execute tests
Commit code
```

---

## 5. Diff-Based Editing

Never:

```text
Rewrite file
```

Always:

```text
Generate patch
```

Example:

```diff
+ Add LoginButton
- Remove legacy auth
```

Benefits:

* Safer
* Faster
* Reversible

---

## 6. Self-Healing Loop

Agent:

```text
Write code
↓
Run tests
↓
Detect failure
↓
Fix issue
↓
Retest
```

Repeat until:

```text
Success
```

---

## 7. Memory System

### Project Memory

Stores:

```text
Architecture
Naming conventions
Libraries
Past decisions
```

### User Memory

Stores:

```text
Preferences
Coding style
Framework choices
```

### Session Memory

Stores:

```text
Current task
Current findings
```

---

## 8. Browser Agent

Capabilities:

```text
Open app
Click buttons
Submit forms
Inspect UI
Take screenshots
```

Powered by:

```text
Playwright
```

Use cases:

```text
E2E testing
UI debugging
Regression testing
```

---

## 9. Git Agent

Capabilities:

```text
Create branch
Commit changes
Generate commit message
Create PR
Resolve conflicts
```

---

## 10. MCP Ecosystem

Support:

```text
GitHub
Notion
Linear
Jira
Slack
Postgres
Supabase
```

Through MCP.

---

# Non Functional Requirements

## Performance

Cold start:

```text
< 5 sec
```

File search:

```text
< 1 sec
```

Patch generation:

```text
< 3 sec
```

---

## Scalability

Support:

```text
100k+ files
1M+ LOC
```

Repositories.

---

## Reliability

Goal:

```text
95% successful edits
```

without breaking build.

---

## Security

Sandbox:

```text
Docker
Firecracker
```

Never execute directly on host.

Dangerous commands:

```text
rm -rf
shutdown
format
```

Require approval.

---

# Architecture

```text
Frontend
│
├── VSCode Extension
├── Web Dashboard
└── CLI
          │
          ▼
Agent Runtime
│
├── Planner
├── Context Engine
├── Tool Router
├── Memory Manager
├── Model Router
└── Execution Loop
          │
          ▼
Tools
│
├── Filesystem
├── Terminal
├── Git
├── Browser
├── MCP
└── Database
          │
          ▼
Models
│
├── Claude
├── GPT
├── Gemini
└── Ollama
```

---

# MVP Scope (30 Days)

### Must Have

✅ Chat Interface

✅ File Editing

✅ Terminal Tool

✅ Repository Indexing

✅ Planning Engine

✅ Memory

✅ Git Integration

✅ Docker Sandbox

---

### Nice To Have

⬜ Browser Automation

⬜ Multi-Agent

⬜ Voice

⬜ PR Generation

⬜ Cloud Sync

---

# Future Roadmap

## V2

Multi-agent swarm

```text
Architect Agent
Backend Agent
Frontend Agent
QA Agent
```

---

## V3

Autonomous SaaS Builder

User:

```text
Build me a CRM
```

Agent:

```text
Plans
Codes
Tests
Deploys
Monitors
```

---

## Success Metrics

### User Metrics

* Daily active developers
* Tasks completed
* Time saved

### Agent Metrics

* Build success rate
* Patch acceptance rate
* Test pass rate
* Context retrieval accuracy

### Business Metrics

* Monthly active users
* Paid conversions
* API costs per task

---

If you're actually going to build this, I'd skip the "AI wrapper" phase and focus the first month on **three things only**:

1. Repository indexing (RAG for code)
2. Tool execution framework
3. Diff-based code editing

Those three components are what separate a real coding agent from a chatbot that happens to write code.
