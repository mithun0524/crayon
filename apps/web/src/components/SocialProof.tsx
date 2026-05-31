import React from 'react';

export default function SocialProof() {
  return (
    <section className="py-20 w-full overflow-hidden border-y border-white/5 bg-[#121214]" aria-label="Trusted companies">
      <p className="text-center text-sm font-inter text-white/40 tracking-widest uppercase mb-10">Trusted by elite developer teams</p>
      
      <div className="relative flex overflow-x-hidden w-full max-w-7xl mx-auto focus-ring" tabIndex={0} aria-label="Scrolling list of trusted companies">
        <div className="absolute top-0 left-0 w-32 h-full bg-gradient-to-r from-[#121214] to-transparent z-10 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#121214] to-transparent z-10 pointer-events-none"></div>
        
        <div className="animate-marquee flex items-center space-x-16 whitespace-nowrap px-8">
          {/* Mock Logos */}
          {['Vercel', 'Linear', 'Raycast', 'Stripe', 'Figma', 'Supabase', 'Next.js', 'Vercel', 'Linear', 'Raycast'].map((logo, idx) => (
            <div key={idx} className="text-2xl font-outfit font-bold text-white/20 hover:text-white/60 transition-colors cursor-default select-none focus-ring" tabIndex={0}>
              {logo}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
