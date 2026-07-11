'use client';
import { useState } from 'react';
import Reveal from './motion/Reveal';

// The 12 crayons the CLI ships (theme.ts ACCENTS) — the real brand palette.
const CRAYONS = [
  { name: 'teal', v: '--cr-teal', label: 'Crayon Teal' },
  { name: 'violet', v: '--cr-violet', label: 'Electric Violet' },
  { name: 'magenta', v: '--cr-magenta', label: 'Crayon Magenta' },
  { name: 'coral', v: '--cr-coral', label: 'Coral' },
  { name: 'rose', v: '--cr-rose', label: 'Rose Red' },
  { name: 'tangerine', v: '--cr-tangerine', label: 'Tangerine' },
  { name: 'amber', v: '--cr-amber', label: 'Amber' },
  { name: 'lime', v: '--cr-lime', label: 'Lime Punch' },
  { name: 'emerald', v: '--cr-emerald', label: 'Emerald' },
  { name: 'sky', v: '--cr-sky', label: 'Sky Blue' },
  { name: 'indigo', v: '--cr-indigo', label: 'Indigo' },
  { name: 'clay', v: '--cr-clay', label: 'Clay (Claude)' },
];

function Crayon({ color, active, onPick, label }: { color: string; active: boolean; onPick: () => void; label: string }) {
  return (
    <button
      onClick={onPick}
      aria-label={`Set accent to ${label}`}
      aria-pressed={active}
      className={`group relative transition-transform duration-300 ${active ? '-translate-y-3' : 'hover:-translate-y-2'}`}
      style={{ perspective: 400 }}
    >
      <svg width="34" height="150" viewBox="0 0 34 150" fill="none" className="drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
        {/* tip */}
        <path d="M6 26 L17 2 L28 26 Z" fill={color} />
        <path d="M12 26 L17 12 L22 26 Z" fill="rgba(8,8,10,0.35)" />
        {/* barrel */}
        <rect x="6" y="26" width="22" height="120" rx="4" fill={color} />
        {/* label bands */}
        <rect x="6" y="52" width="22" height="16" fill="rgba(8,8,10,0.28)" />
        <rect x="6" y="104" width="22" height="10" fill="rgba(255,255,255,0.12)" />
        {/* highlight */}
        <rect x="9" y="28" width="4" height="116" rx="2" fill="rgba(255,255,255,0.22)" />
      </svg>
      <span
        className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] transition-opacity ${
          active ? 'opacity-100 text-paper' : 'opacity-0 group-hover:opacity-70 text-dim'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export default function Palette() {
  const [active, setActive] = useState('teal');

  const pick = (name: string, v: string) => {
    setActive(name);
    document.documentElement.style.setProperty('--accent', `var(${v})`);
  };

  return (
    <section className="w-full border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <Reveal className="mb-4 text-center">
          <p className="kicker mb-4 text-accent-ink">/color</p>
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
            Your terminal,
            <span className="font-display italic text-accent-ink accent-glow"> your colors.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-dim">
            Crayon ships a whole box. Pick one — the whole page recolors, just
            like the <span className="font-mono text-paper/80">/color</span> command in the CLI.
          </p>
        </Reveal>

        <div className="mt-20 flex flex-wrap items-end justify-center gap-4 pb-8 sm:gap-5">
          {CRAYONS.map((c) => (
            <Crayon
              key={c.name}
              color={`var(${c.v})`}
              label={c.label}
              active={active === c.name}
              onPick={() => pick(c.name, c.v)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
