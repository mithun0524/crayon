import React from 'react';

export default function PageHeader({ title, description, badge }: { title: string, description: string, badge?: string }) {
  return (
    <section className="pt-40 pb-16 px-6 w-full max-w-4xl mx-auto text-center flex flex-col items-center relative z-10">
      {badge && (
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#121214] text-[#00E5FF] text-xs font-inter tracking-wide uppercase border border-[#00E5FF]/20 mb-8 fade-in-up shadow-[0_0_15px_rgba(0,229,255,0.1)]">
          {badge}
        </div>
      )}
      <h1 className="text-5xl md:text-7xl font-outfit font-bold text-white mb-6 tracking-tight text-glow fade-in-up delay-100">
        {title}
      </h1>
      <p className="text-xl text-white/50 font-inter max-w-2xl mx-auto leading-relaxed fade-in-up delay-200">
        {description}
      </p>
    </section>
  );
}
