import React from 'react';

const testimonials = [
  { quote: "It literally built a Next.js dashboard from my Figma export in 3 minutes.", author: "Sarah L.", role: "Frontend Lead" },
  { quote: "The diff patches are surgical. It never overwrites my custom logic.", author: "James T.", role: "Senior Engineer" },
  { quote: "I let Crayon run my refactoring tasks overnight. I wake up to perfectly typed PRs.", author: "Elena M.", role: "CTO" },
  { quote: "Context Engine is the real deal. It only grabbed the 4 files needed to fix the auth bug.", author: "David K.", role: "Fullstack Dev" },
  { quote: "Best AI coding tool I've used. It's actually autonomous.", author: "Alex R.", role: "Indie Hacker" },
  { quote: "The self-healing loop caught a circular dependency I missed for hours.", author: "Michael P.", role: "Backend Lead" },
];

export default function Testimonials() {
  return (
    <section className="py-32 px-6 max-w-7xl mx-auto w-full border-t border-white/5">
      <div className="text-center mb-20">
        <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white mb-6">Loved by engineers</h2>
        <p className="text-lg text-white/50 font-inter">Don't just take our word for it.</p>
      </div>

      <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
        {testimonials.map((t, i) => (
          <div key={i} className="break-inside-avoid p-8 rounded-3xl bg-[#121214] border border-white/10 hover:border-white/20 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <div className="flex text-[#00E5FF] mb-6">
              {[...Array(5)].map((_, j) => (
                <svg key={j} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <p className="text-white/80 font-inter leading-relaxed mb-6">"{t.quote}"</p>
            <div>
              <p className="text-white font-medium font-outfit">{t.author}</p>
              <p className="text-white/40 text-sm font-inter">{t.role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
