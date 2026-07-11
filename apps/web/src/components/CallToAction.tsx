'use client';
import Link from 'next/link';
import { useState } from 'react';
import Reveal from './motion/Reveal';
import { SITE } from '../lib/site';

export default function CallToAction() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SITE.install);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-28">
      <Reveal>
        <div className="on-dark relative overflow-hidden rounded-[2.5rem] border border-line bg-ink-900 px-8 py-20 text-center shadow-[0_40px_100px_-40px_rgba(28,25,23,0.5)] md:px-24 md:py-28">
          <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[70%] -translate-x-1/2 rounded-full bg-accent/[0.08] blur-[120px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

          <p className="kicker mb-6">Ready when you are</p>
          <h2 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-paper sm:text-6xl">
            Hand off the busywork.
            <br />
            <span className="font-display italic text-accent-ink text-glow">Keep the thinking.</span>
          </h2>

          <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4">
            <button
              onClick={copy}
              className="btn-ghost group flex w-full items-center justify-between gap-3 py-3 pl-6 pr-3 text-sm"
              aria-label="Copy install command"
            >
              <code className="font-mono text-paper/85">{SITE.install}</code>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-paper/5 group-hover:bg-paper/10">
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
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Link href={SITE.getStarted} className="btn-primary flex-1 py-3.5 text-sm">
                Get started
              </Link>
              <Link href="/docs" className="btn-ghost flex-1 py-3.5 text-sm">
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
