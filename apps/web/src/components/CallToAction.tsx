import React from 'react';

export default function CallToAction() {
  return (
    <section className="py-32 px-6 w-full max-w-6xl mx-auto">
      <div className="relative rounded-[3rem] overflow-hidden bg-[#121214] border border-white/10 p-12 md:p-24 text-center flex flex-col items-center">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-[#00E5FF]/5 blur-3xl -z-10 pointer-events-none mix-blend-screen"></div>
        
        <h2 className="text-5xl md:text-7xl font-outfit font-bold text-white mb-8 tracking-tight text-glow">
          Ready to automate <br className="hidden md:block"/> your terminal?
        </h2>
        <p className="text-xl text-white/60 font-inter max-w-2xl mx-auto mb-12 tracking-wide">
          Join thousands of developers building software at the speed of thought. Start using Crayon today.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button className="bg-white text-[#09090B] px-8 py-4 rounded-full font-inter font-medium hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)] focus-ring">
            Start Building Free
          </button>
          <button className="bg-[#121214] px-8 py-4 rounded-full font-inter font-medium text-white hover:bg-white/5 transition-colors border border-white/20 focus-ring">
            Read the Documentation
          </button>
        </div>
      </div>
    </section>
  );
}
