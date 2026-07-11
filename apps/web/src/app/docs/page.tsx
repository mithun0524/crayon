import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import CodeBlock from '../../components/CodeBlock';
import Reveal from '../../components/motion/Reveal';
import { SITE } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Get Started — Crayon',
  description: 'Install Crayon, connect a model provider, and run your first autonomous task from the terminal.',
};

const PROVIDERS = [
  { name: 'Anthropic', env: 'ANTHROPIC_API_KEY', note: 'Claude models (recommended)' },
  { name: 'OpenAI', env: 'OPENAI_API_KEY', note: 'GPT models' },
  { name: 'Google', env: 'GEMINI_API_KEY', note: 'Gemini models' },
  { name: 'OpenRouter', env: 'OPENROUTER_API_KEY', note: 'Any model via OpenRouter' },
  { name: 'Ollama', env: '— none —', note: 'Local & offline, no key required' },
];

const COMMANDS = [
  ['crayon chat', 'Start an interactive agent session'],
  ['crayon run "<task>"', 'Run a one-shot autonomous task'],
  ['crayon config', 'Re-run the setup wizard'],
  ['crayon init', 'Initialize .crayon/ and index the repo'],
  ['crayon sessions', 'List saved chat sessions'],
  ['crayon chat --resume', 'Resume your most recent session'],
  ['crayon mcp add <name> <cmd>', 'Add an MCP server'],
  ['crayon update', 'Update to the latest version'],
];

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal className="border-t border-line py-12 first:border-t-0">
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-10">
        <div className="flex items-baseline gap-3 md:flex-col md:items-start md:gap-0">
          <span className="font-display text-4xl italic text-accent-ink">{n}</span>
        </div>
        <div className="min-w-0">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight text-paper">{title}</h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-dim">{children}</div>
        </div>
      </div>
    </Reveal>
  );
}

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-36 pb-24">
        <Reveal>
          <p className="kicker mb-4 text-accent-ink">Get started</p>
          <h1 className="text-5xl font-semibold tracking-tight text-paper sm:text-6xl">
            Running in
            <span className="font-display italic text-accent-ink"> a minute.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-dim">
            Install the CLI, connect a model provider, and hand Crayon its first
            task. Bring your own key — or run fully offline with Ollama.
          </p>
        </Reveal>

        <div className="mt-14">
          <Step n="1" title="Install">
            <p>Install globally with npm (or pnpm):</p>
            <CodeBlock label="terminal" code={`npm install -g crayon-cli
# or:  pnpm add -g crayon-cli`} />
            <p>Prefer not to install? Run it straight away:</p>
            <CodeBlock label="terminal" code={SITE.npx} />
          </Step>

          <Step n="2" title="Connect a model provider">
            <p>
              The fastest path is the setup wizard — it asks for your provider,
              model, and API key, then saves them to{' '}
              <code className="font-mono text-paper/85">~/.crayon/config.json</code>:
            </p>
            <CodeBlock label="terminal" code={`crayon config`} />
            <p>Or set an environment variable for your provider and skip the wizard:</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-faint">
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Environment variable</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-dim">
                  {PROVIDERS.map((p) => (
                    <tr key={p.name} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium text-paper">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-accent-ink">{p.env}</td>
                      <td className="px-4 py-3">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock label="~/.zshrc or ~/.bashrc" code={`export ANTHROPIC_API_KEY="sk-ant-..."
# optional overrides:
export CRAYON_PROVIDER="anthropic"
export CRAYON_MODEL="claude-sonnet-4-6"`} />
          </Step>

          <Step n="3" title="Start coding">
            <p>Open an interactive session in your project:</p>
            <CodeBlock label="terminal" code={`cd your-project
crayon chat`} />
            <p>Or fire a one-shot task and let it run:</p>
            <CodeBlock label="terminal" code={`crayon run "add a health-check endpoint and a test for it"`} />
            <p>
              Control how much it can do on its own with{' '}
              <code className="font-mono text-paper/85">--mode</code> (or the{' '}
              <code className="font-mono text-paper/85">/mode</code> command in chat):
            </p>
            <ul className="ml-1 space-y-1.5">
              <li><span className="font-mono text-accent-ink">ask</span> — confirm every edit and command (default)</li>
              <li><span className="font-mono text-accent-ink">auto-edit</span> — apply edits, confirm commands</li>
              <li><span className="font-mono text-accent-ink">plan</span> — plan only, change nothing</li>
              <li><span className="font-mono text-accent-ink">auto</span> — run freely, block dangerous commands</li>
              <li><span className="font-mono text-accent-ink">bypass</span> — no prompts (use with care)</li>
            </ul>
          </Step>

          <Step n="4" title="Run offline (optional)">
            <p>
              Point Crayon at a local <Link href="https://ollama.com" className="text-accent-ink underline decoration-line underline-offset-4 hover:decoration-current">Ollama</Link>{' '}
              server for zero-cost, fully private runs — no API key:
            </p>
            <CodeBlock label="terminal" code={`ollama run qwen2.5-coder:7b     # pull a model once
export CRAYON_PROVIDER="ollama"
crayon chat`} />
          </Step>

          <Step n="5" title="Go further">
            <p>
              <span className="text-paper">Editor:</span> install the{' '}
              <Link href={SITE.vscode} className="text-accent-ink underline decoration-line underline-offset-4 hover:decoration-current">VS Code extension</Link>{' '}
              for a chat panel with live reasoning and click-to-source citations.
            </p>
            <p>
              <span className="text-paper">Tools:</span> connect any Model Context
              Protocol server to give the agent new capabilities:
            </p>
            <CodeBlock label="terminal" code={`crayon mcp add <name> <command> [args...]
crayon mcp list`} />
          </Step>
        </div>

        {/* Command reference */}
        <Reveal className="mt-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-paper">Command reference</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-[14px]">
              <tbody className="text-dim">
                {COMMANDS.map(([cmd, desc]) => (
                  <tr key={cmd} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-accent-ink">{cmd}</td>
                    <td className="px-4 py-3">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal className="mt-16 flex flex-col gap-3 sm:flex-row">
          <Link href={SITE.repo} className="btn-primary px-6 py-3 text-center text-sm">
            View on GitHub
          </Link>
          <Link href={SITE.npm} className="btn-ghost px-6 py-3 text-center text-sm">
            crayon-cli on npm
          </Link>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
