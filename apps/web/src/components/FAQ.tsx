'use client';
import React, { useState } from 'react';

const faqs = [
  {
    q: "How does Crayon compare to GitHub Copilot?",
    a: "Copilot is an autocomplete tool. Crayon is an autonomous engineer. You don't write code with Crayon; you give it a PRD or a task, and it plans, executes, tests, and self-heals the entire implementation without your intervention."
  },
  {
    q: "What makes the Context Engine different?",
    a: "Other tools send your entire repository to the LLM, which is expensive and often causes hallucinations. Crayon traverses your codebase's AST to surgically fetch only the specific files, functions, and imports necessary for the task, achieving a 95% token reduction."
  },
  {
    q: "Is it safe to run in my terminal?",
    a: "Yes. Crayon operates using diff-based execution. It never blindly overwrites files. It generates surgical diff patches that you can review. Additionally, we strongly recommend running Crayon within a Docker sandbox for complete security."
  },
  {
    q: "Can I use it for existing large codebases?",
    a: "Absolutely. Crayon is designed to index and navigate repositories with 100k+ LOC. Its intelligent RAG and AST traversal means it understands complex architecture just as well as small projects."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-32 px-6 max-w-4xl mx-auto w-full" aria-labelledby="faq-title">
      <div className="text-center mb-16">
        <h2 id="faq-title" className="text-4xl font-outfit font-bold text-white mb-6">Frequently Asked Questions</h2>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="border border-white/10 rounded-2xl bg-[#121214] transition-all">
              <button 
                className="w-full text-left px-8 py-6 flex items-center justify-between focus-ring rounded-2xl"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${i}`}
                id={`faq-question-${i}`}
              >
                <span className="text-lg font-outfit font-medium text-white/90">{faq.q}</span>
                <svg 
                  className={`w-6 h-6 text-white/50 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#00E5FF]' : ''}`} 
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div 
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-question-${i}`}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="px-8 pb-6">
                  <p className="text-white/50 font-inter leading-relaxed tracking-wide">{faq.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
