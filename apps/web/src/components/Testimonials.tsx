import Reveal from './motion/Reveal';
import TextReveal from './motion/TextReveal';

const PRINCIPLES = [
  {
    k: 'Transparent',
    body: 'Every plan, command, and diff is shown before it runs. No black boxes — you see the reasoning and approve the blast radius.',
  },
  {
    k: 'Grounded',
    body: 'Answers come from your actual code, resolved by the index — not guessed from a model that never read your repo.',
  },
  {
    k: 'Yours',
    body: 'Open source and MIT licensed. Run it on your models, your machine, your terms — including fully offline.',
  },
];

// Honest alternative to fabricated testimonials: the product's operating
// principles, stated plainly. Nothing here is invented.
export default function Principles() {
  return (
    <section className="w-full border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-32">
        <div className="max-w-4xl">
          <p className="kicker mb-6">Why Crayon</p>
          <TextReveal
            as="h2"
            text="An agent you can actually trust with your codebase."
            className="text-4xl font-semibold leading-[1.1] tracking-tight text-paper sm:text-6xl"
          />
        </div>

        <div className="mt-20 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.k} delay={i * 0.1} className="h-full">
              <div className="flex h-full flex-col bg-ink-950 p-8">
                <span className="mb-6 font-display text-3xl italic text-accent-ink">{p.k}</span>
                <p className="text-[15px] leading-relaxed text-dim">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
