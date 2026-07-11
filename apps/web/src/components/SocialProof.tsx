import { PROVIDERS, BUILT_WITH } from '../lib/site';

// Honest signal: the model providers Crayon actually supports and the stack it
// is built on. No fabricated logos or "trusted by" claims.
export default function SocialProof() {
  const row = [...PROVIDERS, '·', ...BUILT_WITH];
  const track = [...row, ...row];

  return (
    <section className="w-full border-y border-line bg-ink-900/40 py-14">
      <p className="kicker mb-9 text-center">Plug in any model · run it anywhere</p>

      <div className="relative mx-auto flex w-full max-w-6xl overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-ink-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-ink-950 to-transparent" />

        <div className="animate-marquee flex shrink-0 items-center gap-14 whitespace-nowrap px-7">
          {track.map((name, i) =>
            name === '·' ? (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent/50" />
            ) : (
              <span
                key={i}
                className="select-none font-display text-2xl italic text-paper/25 transition-colors hover:text-paper/70"
              >
                {name}
              </span>
            )
          )}
        </div>
      </div>
    </section>
  );
}
