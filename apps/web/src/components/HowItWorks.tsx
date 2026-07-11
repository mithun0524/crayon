'use client';
import { useRef, useState } from 'react';
import { ScrollTrigger, useGSAP } from '../lib/gsap';
import Reveal from './motion/Reveal';

const STEPS = [
  {
    n: '01',
    title: 'Understand',
    body: 'Crayon indexes your repo with tree-sitter and a local SQLite graph, then pulls only the handful of files a task actually needs — not your whole codebase into the prompt.',
    lines: ['⋯ indexing 42 files', 'resolved: auth.ts, db/schema.ts', '95% fewer tokens loaded'],
  },
  {
    n: '02',
    title: 'Plan',
    body: 'It drafts an explicit, step-by-step plan before touching anything. In plan mode you review and approve it — nothing runs until you say so.',
    lines: ['✎ plan · 4 steps', '1. add stripe deps', '2. checkout route', 'awaiting approval'],
  },
  {
    n: '03',
    title: 'Execute',
    body: 'It runs commands, writes surgical diffs, and edits files under the permission mode you set — Ask, Auto-Edit, or full Auto. You stay in control of the blast radius.',
    lines: ['$ pnpm add stripe', '± route.ts +48 −0', 'mode: auto-edit'],
  },
  {
    n: '04',
    title: 'Self-heal',
    body: 'When a test breaks or a build fails, Crayon reads the error, patches its own work, and re-runs — looping until the task is verified done, not just attempted.',
    lines: ['✗ 1 test failing', '↻ patching route.ts', '✓ verified · committed'],
  },
];

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) =>
          setActive(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))),
      });
      return () => st.kill();
    },
    { scope: ref }
  );

  return (
    <section id="how-it-works" className="w-full border-t border-line">
      <div className="mx-auto max-w-6xl px-6 pt-28">
        <Reveal>
          <p className="kicker mb-4">The loop</p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
            It doesn&apos;t just autocomplete.
            <span className="font-display italic text-accent-ink"> It finishes the job.</span>
          </h2>
        </Reveal>
      </div>

      <div ref={ref} className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 md:grid-cols-2">
        {/* Sticky visual */}
        <div className="top-0 hidden h-screen items-center md:sticky md:flex">
          <div className="on-dark card relative w-full overflow-hidden bg-ink-900 p-8">
            <div className="mb-8 flex items-baseline gap-4">
              <span className="font-display text-7xl italic text-accent-ink/90">{STEPS[active].n}</span>
              <span className="text-2xl font-semibold text-paper">{STEPS[active].title}</span>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-ink-950/60 p-5 font-mono text-[13px]">
              {STEPS[active].lines.map((l) => (
                <div key={l} className="text-dim">
                  <span className="mr-2 text-accent-ink/70">›</span>
                  {l}
                </div>
              ))}
            </div>
            <div className="mt-8 flex gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.n}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                    i === active ? 'bg-accent' : 'bg-paper/10'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Scrolling steps */}
        <div className="flex flex-col">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="flex min-h-[70vh] flex-col justify-center py-10 md:min-h-screen"
              onMouseEnter={() => setActive(i)}
            >
              <span className="mb-4 font-mono text-sm text-faint md:hidden">{s.n}</span>
              <h3 className="mb-5 text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
                {s.title}
              </h3>
              <p className="max-w-md text-lg leading-relaxed text-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
