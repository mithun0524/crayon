'use client';
import React, { useState } from 'react';

export default function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install -g @crayon/cli");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="flex flex-col items-center pt-40 pb-20 px-6 z-10 w-full max-w-7xl mx-auto relative">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#121214] border border-white/10 text-white/80 text-xs font-inter tracking-wide uppercase mb-10 fade-in-up delay-100">
        <span className="w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"></span>
        Forge Protocol v1.0
      </div>

      <h1 className="text-6xl md:text-8xl font-outfit font-bold tracking-tight text-center text-white mb-8 max-w-5xl leading-[1.1] fade-in-up delay-200">
        Your Terminal. <br />
        <span className="text-[#00E5FF] italic font-light tracking-tighter drop-shadow-sm">Now Autonomous.</span>
      </h1>

      <p className="text-lg md:text-xl text-white/50 max-w-2xl text-center mb-14 font-inter font-light leading-relaxed tracking-wide fade-in-up delay-300">
        Crayon is an ultra-capable AI coding agent that lives directly in your terminal. It understands your entire codebase, plans, executes, and iterates. Chill out while it writes the code.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-6 mb-24 fade-in-up delay-400">
        <button className="bg-white text-[#09090B] px-8 py-3.5 rounded-full font-inter font-medium text-sm hover:scale-105 hover:bg-gray-100 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center gap-2 focus-ring">
          Start Building
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-4 bg-[#121214] rounded-full pl-6 pr-2 py-2 group hover:bg-[#1A1A1D] transition-colors border border-white/10 focus-ring cursor-copy"
          aria-label="Copy install command"
        >
          <code className="text-sm font-mono text-white/80">npm install -g @crayon/cli</code>
          <div className="bg-white/5 text-white/80 p-2 rounded-full group-hover:bg-white/10 transition-all relative">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </div>
        </button>
      </div>

      {/* Immersive Terminal Mockup */}
      <div className="w-full max-w-5xl rounded-3xl overflow-hidden bg-[#121214] border border-white/10 fade-in-up delay-500 relative group shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]" tabIndex={0} aria-label="Terminal demonstration">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/30 to-transparent"></div>
        
        {/* Terminal Header */}
        <div className="flex items-center px-6 py-4 border-b border-white/5 bg-[#09090B]">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-white/20 group-hover:bg-[#FF3366] transition-colors" />
            <div className="w-3 h-3 rounded-full bg-white/20 group-hover:bg-[#FFBD2E] transition-colors delay-75" />
            <div className="w-3 h-3 rounded-full bg-white/20 group-hover:bg-[#00FF66] transition-colors delay-150" />
          </div>
          <div className="mx-auto text-xs font-mono tracking-widest uppercase text-white/40">Crayon Engine — ~/projects/forge</div>
        </div>

        {/* Terminal Body */}
        <div className="p-8 font-mono text-[13px] md:text-[15px] leading-relaxed space-y-5 h-[420px] overflow-hidden bg-[#09090B]">
          <div className="flex gap-4 items-start">
            <span className="text-[#00FF66] shrink-0 font-bold">~</span>
            <div className="text-white/90">
              <span className="text-[#00E5FF] font-semibold">crayon</span> "Implement a secure Stripe checkout flow with webhooks"
            </div>
          </div>
          
          <div className="pl-6 space-y-3 opacity-90 border-l border-white/10 ml-1.5">
            <div className="flex items-center gap-3 text-white/50">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Scanning repository context (95% token reduction applied)...
            </div>
            <div className="text-white/40">Found Next.js application in apps/web. Database schema identified in packages/db.</div>
            <div className="flex items-center gap-3 text-white/70">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              Execution plan generated and approved
            </div>
            <div className="text-white/70">🔨 Running: <span className="text-white">pnpm add stripe @stripe/stripe-js</span></div>
            <div className="text-white/70">✏️ Modifying: <span className="text-white">src/app/api/checkout/route.ts</span> (diff patch)</div>
            <div className="text-white/50">Running tests... <span className="text-[#FF3366]">1 failed.</span> Self-healing initiated...</div>
            <div className="text-[#00FF66]">✓ Issue resolved in src/app/api/checkout/route.ts. Tests passed.</div>
          </div>

          <div className="flex gap-4 items-center pt-4">
            <span className="text-[#00FF66] shrink-0 font-bold">~</span>
            <div className="text-white/80 typing-cursor">
              Ready for next task
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 fade-in-up delay-500 opacity-50 hidden md:flex">
        <span className="text-[10px] font-inter uppercase tracking-widest text-white/40">Scroll</span>
        <div className="w-5 h-8 border border-white/20 rounded-full flex justify-center p-1">
          <div className="w-1 h-2 bg-white/40 rounded-full animate-bounce"></div>
        </div>
      </div>
    </section>
  );
}
