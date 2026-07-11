'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SITE } from '../lib/site';
import TerminalDemo from './TerminalDemo';
import Parallax from './motion/Parallax';
import Magnetic from './motion/Magnetic';
import CrayonStroke from './CrayonStroke';

export default function Hero() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(SITE.install);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-40 pb-24 text-center">
      <div className="fade-up d1 mb-9 inline-flex items-center gap-2.5 rounded-full border border-line bg-ink-900/60 px-4 py-1.5 backdrop-blur">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <span className="font-mono text-[11px] tracking-[0.18em] text-dim">
          v{SITE.version} · OPEN SOURCE · {SITE.license}
        </span>
      </div>

      <h1 className="fade-up d2 max-w-4xl text-balance text-[3.25rem] font-semibold leading-[0.98] tracking-tight text-paper sm:text-7xl md:text-[5.25rem]">
        Your terminal,
        <br />
        <span className="relative inline-block font-display text-[3.5rem] font-normal italic text-accent-ink text-glow sm:text-[4.75rem] md:text-[5.75rem]">
          now autonomous.
          <CrayonStroke className="absolute -bottom-3 left-0 h-4 w-full sm:-bottom-4" />
        </span>
      </h1>

      <p className="fade-up d3 mt-8 max-w-xl text-pretty text-lg leading-relaxed text-dim">
        Crayon is an AI coding agent that lives in your terminal. It reads your
        whole codebase, plans, runs commands, and self-heals its own errors —
        until the task is actually done.
      </p>

      <div className="fade-up d4 mt-11 flex flex-col items-center gap-4 sm:flex-row">
        <Magnetic strength={0.4}>
          <Link href={SITE.demo} className="btn-primary flex items-center gap-2 px-7 py-3.5 text-sm">
            Try the live demo
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </Magnetic>
        <button
          onClick={copy}
          className="btn-ghost group flex items-center gap-3 py-2 pl-5 pr-2 text-sm"
          aria-label="Copy install command"
        >
          <code className="font-mono text-paper/85">{SITE.install}</code>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-paper/5 transition-colors group-hover:bg-paper/10">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </span>
        </button>
      </div>

      <div className="fade-up d5 mt-20 w-full">
        <Parallax speed={0.06}>
          <TerminalDemo />
        </Parallax>
      </div>
    </section>
  );
}
