'use client';
import React, { useState } from 'react';

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="py-32 px-6 max-w-7xl mx-auto w-full relative">
      <div className="text-center mb-20">
        <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white mb-6">Simple, transparent pricing</h2>
        <p className="text-lg text-white/50 font-inter max-w-2xl mx-auto mb-10">Start for free, upgrade when you need more power.</p>
        
        {/* Toggle */}
        <div className="inline-flex items-center bg-[#121214] rounded-full p-1 border border-white/10">
          <button 
            onClick={() => setIsAnnual(false)}
            className={`px-6 py-2 rounded-full text-sm font-medium font-inter transition-colors focus-ring ${!isAnnual ? 'bg-white text-[#09090B]' : 'text-white/50 hover:text-white'}`}
            aria-pressed={!isAnnual}
          >
            Monthly
          </button>
          <button 
            onClick={() => setIsAnnual(true)}
            className={`px-6 py-2 rounded-full text-sm font-medium font-inter transition-colors focus-ring ${isAnnual ? 'bg-white text-[#09090B]' : 'text-white/50 hover:text-white'}`}
            aria-pressed={isAnnual}
          >
            Annually <span className={`${isAnnual ? 'text-[#09090B]/60' : 'text-[#00E5FF]'} ml-1 text-xs transition-colors`}>-20%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Hobby */}
        <div className="p-10 rounded-3xl border border-white/10 bg-[#121214] flex flex-col">
          <div className="mb-8">
            <h3 className="text-xl font-outfit font-medium text-white mb-2">Hobby</h3>
            <p className="text-white/50 font-inter text-sm">Perfect for solo developers and side projects.</p>
          </div>
          <div className="mb-8 flex items-end gap-1">
            <span className="text-5xl font-outfit font-bold text-white">$0</span>
            <span className="text-white/40 font-inter pb-2">/mo</span>
          </div>
          <ul className="space-y-4 mb-10 flex-1">
            <Feature item="500 tasks per month" />
            <Feature item="Standard Context Engine" />
            <Feature item="Community Support" />
          </ul>
          <button className="w-full py-4 rounded-xl text-white hover:bg-white/10 transition-colors font-medium border border-white/30 focus-ring">Get Started Free</button>
        </div>

        {/* Pro */}
        <div className="p-10 rounded-3xl border border-[#00E5FF]/50 bg-[#09090B] flex flex-col relative transform md:-translate-y-4 shadow-[0_0_40px_rgba(0,229,255,0.1)]">
          <div className="absolute top-0 inset-x-0 flex justify-center -translate-y-1/2">
            <span className="bg-[#00E5FF] text-[#09090B] text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">Most Popular</span>
          </div>
          <div className="mb-8">
            <h3 className="text-xl font-outfit font-medium text-white mb-2">Pro</h3>
            <p className="text-white/50 font-inter text-sm">For professional developers needing maximum autonomy.</p>
          </div>
          <div className="mb-8 flex flex-col">
            <div className="flex items-end gap-1">
              <span className="text-5xl font-outfit font-bold text-white transition-all">{isAnnual ? '$24' : '$29'}</span>
              <span className="text-white/40 font-inter pb-2">/mo</span>
            </div>
            {isAnnual && <span className="text-[#00E5FF] text-sm font-inter mt-2">Billed $288 yearly</span>}
          </div>
          <ul className="space-y-4 mb-10 flex-1">
            <Feature item="Unlimited tasks" />
            <Feature item="Advanced Context Engine (95% reduction)" />
            <Feature item="Self-Healing Loop" />
            <Feature item="Browser Agent Testing" />
            <Feature item="Priority Support" />
          </ul>
          <button className="w-full py-4 rounded-xl bg-white text-[#09090B] hover:bg-gray-200 transition-colors font-medium focus-ring shadow-[0_0_15px_rgba(255,255,255,0.2)]">Upgrade to Pro</button>
        </div>

        {/* Team */}
        <div className="p-10 rounded-3xl border border-white/10 bg-[#121214] flex flex-col">
          <div className="mb-8">
            <h3 className="text-xl font-outfit font-medium text-white mb-2">Team</h3>
            <p className="text-white/50 font-inter text-sm">For agencies and startups scaling development.</p>
          </div>
          <div className="mb-8 flex flex-col">
             <div className="flex items-end gap-1">
                <span className="text-5xl font-outfit font-bold text-white transition-all">{isAnnual ? '$79' : '$99'}</span>
                <span className="text-white/40 font-inter pb-2">/seat/mo</span>
             </div>
             {isAnnual && <span className="text-[#00E5FF] text-sm font-inter mt-2">Billed $948 yearly</span>}
          </div>
          <ul className="space-y-4 mb-10 flex-1">
            <Feature item="Everything in Pro" />
            <Feature item="Multi-Agent Swarm (Architect, QA)" />
            <Feature item="Centralized Project Memory" />
            <Feature item="Enterprise SSO" />
            <Feature item="Dedicated Success Manager" />
          </ul>
          <button className="w-full py-4 rounded-xl text-white hover:bg-white/10 transition-colors font-medium border border-white/10 focus-ring">Contact Sales</button>
        </div>
      </div>
    </section>
  );
}

function Feature({ item }: { item: string }) {
  return (
    <li className="flex items-start gap-3 text-white/70 font-inter text-sm tracking-wide">
      <svg className="w-5 h-5 text-[#00E5FF] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {item}
    </li>
  );
}
