import React from 'react';

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 px-6 max-w-7xl mx-auto w-full relative">
      <div className="text-center mb-24">
        <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white mb-6">Autonomous from end to end</h2>
        <p className="text-lg text-white/50 font-inter max-w-2xl mx-auto">
          Crayon isn't an autocomplete. It's an agentic loop that understands, plans, and executes your tasks perfectly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {/* Connecting Line */}
        <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2 -z-10"></div>

        <div className="fade-in-up delay-100">
          <StepCard 
            step="01"
            title="Context Engine"
            desc="Instead of drowning the context window, Crayon intelligently searches your codebase and loads only the specific files, imports, and dependencies needed."
          />
        </div>
        
        <div className="fade-in-up delay-300">
          <StepCard 
            step="02"
            title="Diff-Based Execution"
            desc="Crayon creates a step-by-step execution plan and writes surgical diff patches to safely modify files without destructive overwrites."
          />
        </div>

        <div className="fade-in-up delay-500">
          <StepCard 
            step="03"
            title="Self-Healing Loop"
            desc="It runs tests and builds automatically. If it detects a failure, it reads the error, generates a fix, and re-tests until successful."
          />
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, title, desc }: { step: string, title: string, desc: string }) {
  return (
    <div className="glass-panel glass-card-hover rounded-3xl p-8 flex flex-col items-center text-center relative border border-white/10 bg-[#121214] h-full shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      <div className="w-16 h-16 rounded-full bg-[#09090B] flex items-center justify-center text-2xl font-outfit font-bold mb-6 border border-white/10 text-white">
        {step}
      </div>
      <h3 className="text-2xl font-outfit font-semibold text-white mb-4">{title}</h3>
      <p className="text-white/50 font-inter leading-relaxed text-sm tracking-wide">{desc}</p>
    </div>
  );
}
