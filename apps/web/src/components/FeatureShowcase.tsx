import Reveal from './motion/Reveal';

// One crayon per card — the grid reads as a box of colors.
const CARD_COLORS = [
  '--cr-teal', '--cr-violet', '--cr-tangerine', '--cr-lime',
  '--cr-magenta', '--cr-sky', '--cr-amber', '--cr-emerald',
];

const FEATURES = [
  {
    title: 'Context Engine',
    body: 'A local tree-sitter + SQLite index resolves the exact files a task needs. Semantic search and dependency graphs — not your whole repo stuffed into the prompt.',
    span: 'md:col-span-2',
    accent: true,
  },
  {
    title: 'Five model providers',
    body: 'Hot-swap between Anthropic, OpenAI, Google, OpenRouter, and local Ollama mid-chat — without leaving your flow.',
  },
  {
    title: 'Runs fully offline',
    body: 'Point Crayon at a local Ollama server for zero-cost, private runs. No API key, no data leaving your machine.',
  },
  {
    title: 'Permission modes',
    body: 'Ask, Auto-Edit, or Auto. Fine-grained control with guards against path traversal, oversized reads, and destructive commands.',
  },
  {
    title: 'Self-healing loop',
    body: 'Intercepts failing tests and broken builds, patches its own work, and re-runs until the task is verified done.',
    span: 'md:col-span-2',
    accent: true,
  },
  {
    title: 'MCP extensible',
    body: 'Connect any Model Context Protocol server to give the agent new tools and integrations.',
  },
  {
    title: 'VS Code, too',
    body: 'A transparency-first panel with live reasoning, tool cards, and click-to-source path:line citations.',
  },
  {
    title: 'Auto-compaction',
    body: 'Intelligent history compaction keeps token burn low, with real-time cost tracking per session.',
  },
];

export default function FeatureShowcase() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-6 py-28">
      <Reveal>
        <p className="kicker mb-4">Capabilities</p>
        <h2 className="mb-16 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
          Everything an agent needs to
          <span className="font-display italic text-accent-ink"> ship real work.</span>
        </h2>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {FEATURES.map((f, i) => {
          const c = CARD_COLORS[i % CARD_COLORS.length];
          return (
            <Reveal key={f.title} delay={(i % 3) * 0.08} className={f.span ?? ''}>
              <div
                className="card group relative h-full overflow-hidden p-7"
                style={{ ['--card' as string]: `var(${c})` }}
              >
                {/* colored top edge that lights up on hover */}
                <span className="absolute inset-x-0 top-0 h-px bg-[var(--card)] opacity-40 transition-opacity duration-300 group-hover:opacity-100" />
                <div
                  className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-sm"
                  style={{ color: `var(${c})`, borderColor: `color-mix(in srgb, var(${c}) 40%, transparent)`, background: `color-mix(in srgb, var(${c}) 8%, transparent)` }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="mb-2.5 text-lg font-semibold text-paper">{f.title}</h3>
                <p className="text-[15px] leading-relaxed text-dim">{f.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
