import Link from 'next/link';
import Reveal from './motion/Reveal';
import { SITE } from '../lib/site';

const INCLUDED = [
  'The full autonomous agent — no feature gates',
  'Context engine, self-healing, permission modes',
  'CLI + VS Code extension',
  'All five model providers & MCP servers',
  'Runs fully offline with Ollama',
];

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-28">
      <Reveal className="text-center">
        <p className="kicker mb-4">Pricing</p>
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
          Free, and
          <span className="font-display italic text-accent-ink"> open source.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-dim">
          Crayon itself costs nothing. You only ever pay your own model provider
          for tokens — or nothing at all when you run it locally with Ollama.
        </p>
      </Reveal>

      <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-5">
        <Reveal className="md:col-span-3">
          <div className="card flex h-full flex-col p-9">
            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-6xl font-semibold tracking-tight text-paper">$0</span>
              <span className="text-dim">/ forever</span>
            </div>
            <p className="mb-8 text-dim">Everything, for everyone. {SITE.license} licensed.</p>
            <ul className="mb-9 flex-1 space-y-3.5">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[15px] text-paper/85">
                  <svg className="mt-1 h-4 w-4 shrink-0 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={SITE.repo} className="btn-primary flex-1 py-3 text-center text-sm">
                Get started on GitHub
              </Link>
              <Link href={SITE.getStarted} className="btn-ghost flex-1 py-3 text-center text-sm">
                Read the guide
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="md:col-span-2">
          <div className="card flex h-full flex-col justify-between p-9">
            <div>
              <p className="kicker mb-4">Model usage</p>
              <p className="text-[15px] leading-relaxed text-dim">
                Bring your own key for Anthropic, OpenAI, Google, or OpenRouter —
                you&apos;re billed by them at cost, with per-session tracking in
                the CLI.
              </p>
            </div>
            <div className="mt-8 rounded-xl border border-line bg-ink-950/60 p-5">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-paper">$0</span>
                <span className="text-sm text-dim">with Ollama</span>
              </div>
              <p className="font-mono text-xs text-faint">local · private · no key required</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
