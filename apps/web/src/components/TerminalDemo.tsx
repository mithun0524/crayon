'use client';
import { useEffect, useRef, useState } from 'react';

type Line = { kind: 'prompt' | 'muted' | 'ok' | 'run' | 'edit' | 'warn' | 'plan'; text: string };

const SCRIPT: Line[] = [
  { kind: 'prompt', text: 'crayon "add a secure Stripe checkout flow with webhooks"' },
  { kind: 'muted', text: '⋯ reading repository — 42 files, indexed with tree-sitter' },
  { kind: 'muted', text: '  found Next.js app in apps/web · schema in packages/db' },
  { kind: 'muted', text: '  loading only the files this task needs' },
  { kind: 'plan', text: '✎ plan: 4 steps · approved (auto-edit)' },
  { kind: 'run', text: '$ pnpm add stripe @stripe/stripe-js' },
  { kind: 'edit', text: '± src/app/api/checkout/route.ts  +48 −0' },
  { kind: 'edit', text: '± src/app/api/webhook/route.ts   +37 −0' },
  { kind: 'run', text: '$ pnpm test' },
  { kind: 'warn', text: '✗ 1 failing — webhook signature not verified' },
  { kind: 'muted', text: '↻ self-healing — patching route.ts' },
  { kind: 'ok', text: '✓ all tests pass · verified · committed' },
];

const COLOR: Record<Line['kind'], string> = {
  prompt: 'text-paper',
  muted: 'text-faint',
  ok: 'text-[#4ade80]',
  run: 'text-cyan',
  edit: 'text-paper/80',
  warn: 'text-coral',
  plan: 'text-[#c084fc]',
};

export default function TerminalDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVisible(SCRIPT.length);
      return;
    }
    let i = 0;
    const tick = () => {
      i += 1;
      setVisible(i);
      if (i < SCRIPT.length) {
        timer = setTimeout(tick, i < 4 ? 520 : 380);
      }
    };
    let timer = setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, [started]);

  return (
    <div
      ref={ref}
      className="on-dark group relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-[0_40px_100px_-30px_rgba(28,25,23,0.45)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />

      <div className="flex items-center gap-4 border-b border-line bg-ink-950/60 px-5 py-3.5">
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-paper/15 transition-colors group-hover:bg-coral" />
          <span className="h-3 w-3 rounded-full bg-paper/15 transition-colors group-hover:bg-[#fbbf24]" />
          <span className="h-3 w-3 rounded-full bg-paper/15 transition-colors group-hover:bg-[#4ade80]" />
        </div>
        <span className="mx-auto font-mono text-[11px] tracking-[0.16em] text-faint">
          crayon — ~/projects/forge
        </span>
      </div>

      <div className="min-h-[22rem] space-y-2 p-6 text-left font-mono text-[13px] leading-relaxed sm:min-h-[24rem] sm:text-[14px]">
        {SCRIPT.slice(0, visible).map((l, i) => {
          const isLast = i === visible - 1;
          return (
            <div
              key={i}
              className={`flex gap-3 ${l.kind !== 'prompt' ? 'pl-4' : ''} ${COLOR[l.kind]} ${isLast ? 'caret' : ''}`}
              style={{ animation: 'fadeUp 0.35s ease both' }}
            >
              {l.kind === 'prompt' && <span className="shrink-0 font-bold text-[#4ade80]">❯</span>}
              <span>{l.text}</span>
            </div>
          );
        })}
        {visible >= SCRIPT.length && (
          <div className="flex gap-3 pt-2 text-paper/70" style={{ animation: 'fadeUp 0.4s ease both' }}>
            <span className="shrink-0 font-bold text-[#4ade80]">❯</span>
            <span className="caret text-faint">ready for the next task</span>
          </div>
        )}
      </div>
    </div>
  );
}
