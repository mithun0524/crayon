'use client';
import { useState } from 'react';
import Reveal from './motion/Reveal';

const faqs = [
  {
    q: 'How is this different from autocomplete tools?',
    a: 'Autocomplete suggests the next line while you type. Crayon takes a whole task — reads the relevant code, writes a plan, runs commands, edits files, and fixes failing tests on its own, showing you each step along the way.',
  },
  {
    q: 'What does the Context Engine actually do?',
    a: 'Instead of stuffing your entire repository into the prompt, Crayon indexes the codebase with tree-sitter and a local SQLite graph, then loads only the files, symbols, and imports a task needs. Lower cost, fewer hallucinations.',
  },
  {
    q: 'Is it safe to let it run in my terminal?',
    a: 'You choose the permission mode — Ask, Auto-Edit, or Auto. Edits are applied as reviewable diffs (with per-hunk approval), and there are built-in guards against path traversal, oversized reads, destructive commands, and SSRF on outbound fetches.',
  },
  {
    q: 'Which models can I use?',
    a: 'Anthropic, OpenAI, Google, and OpenRouter with your own key, or a local Ollama server for fully offline, zero-cost runs. You can hot-swap models mid-conversation.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes — Crayon is open source under the MIT license. You only pay your own model provider for tokens, or nothing when running locally with Ollama.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-28" aria-labelledby="faq-title">
      <Reveal className="mb-14 text-center">
        <p className="kicker mb-4">Questions</p>
        <h2 id="faq-title" className="text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
          Good to know
        </h2>
      </Reveal>

      <div className="space-y-3">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <Reveal key={i} delay={i * 0.05}>
              <div className="overflow-hidden rounded-2xl border border-line bg-ink-900/50">
                <button
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-a-${i}`}
                >
                  <span className="pr-6 text-[17px] font-medium text-paper">{f.q}</span>
                  <svg
                    className={`h-5 w-5 shrink-0 text-faint transition-transform duration-300 ${isOpen ? 'rotate-45 text-accent-ink' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div
                  id={`faq-a-${i}`}
                  className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 leading-relaxed text-dim">{f.a}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
