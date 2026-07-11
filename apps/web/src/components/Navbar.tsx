'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NAV, SITE } from '../lib/site';
import CrayonMark from './CrayonMark';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 mt-4 flex flex-col items-center px-4">
      <nav
        className={`pointer-events-auto mx-auto flex w-full max-w-5xl items-center justify-between rounded-full px-5 py-2.5 transition-all duration-500 ${
          scrolled
            ? 'border border-line bg-ink-900/80 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6)]'
            : 'border border-transparent'
        }`}
      >
        <Link href="/" className="group flex items-center gap-2">
          <span className="transition-transform duration-300 group-hover:rotate-[8deg]">
            <CrayonMark size={30} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-paper">Crayon</span>
          <span className="ml-1 hidden rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-faint sm:inline">
            v{SITE.version}
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-sm text-dim transition-colors hover:text-paper"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link href={SITE.repo} className="text-sm text-dim transition-colors hover:text-paper">
            GitHub
          </Link>
          <ThemeToggle />
          <Link href={SITE.getStarted} className="btn-primary px-4 py-1.5 text-sm">
            Get started
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
        <ThemeToggle />
        <button
          className="p-1.5 text-paper"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
        </div>
      </nav>

      <div
        className={`pointer-events-auto mt-2 w-full max-w-sm origin-top rounded-3xl border border-line bg-ink-900/95 p-5 backdrop-blur-xl transition-all duration-300 md:hidden ${
          open ? 'scale-y-100 opacity-100' : 'pointer-events-none scale-y-0 opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="flex flex-col gap-1 text-sm text-dim">
          {NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg p-2.5 transition-colors hover:bg-ink-800 hover:text-paper"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link href={SITE.repo} className="rounded-lg p-2.5 hover:bg-ink-800 hover:text-paper" onClick={() => setOpen(false)}>
            GitHub
          </Link>
        </div>
        <Link href={SITE.getStarted} className="btn-primary mt-3 block w-full py-3 text-center text-sm" onClick={() => setOpen(false)}>
          Get started
        </Link>
      </div>
    </header>
  );
}
