// Single source of truth for factual site content. No invented metrics,
// companies, or testimonials — everything here is verifiable.

export const SITE = {
  name: "Crayon",
  version: "0.3.1", // keep in sync with packages/cli/package.json
  tagline: "The autonomous AI coding agent for your terminal.",
  install: "npm install -g crayon-cli",
  npx: "npx crayon-cli@latest chat",
  repo: "https://github.com/mithun0524/crayon",
  npm: "https://www.npmjs.com/package/crayon-cli",
  vscode: "https://www.npmjs.com/package/crayon-vscode",
  demo: "https://crayon-umber.vercel.app/",
  license: "MIT",
} as const;

// Model providers Crayon actually supports (packages/agent).
export const PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "OpenRouter",
  "Ollama",
] as const;

// The stack Crayon is genuinely built on.
export const BUILT_WITH = [
  "TypeScript",
  "Tree-sitter",
  "MCP",
  "ink",
  "SQLite",
] as const;

export const NAV = [
  { label: "Features", href: "/features" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Changelog", href: "/changelog" },
  { label: "Blog", href: "/blog" },
] as const;
