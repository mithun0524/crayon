import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

export default function LegalLayout({ title, lastUpdated, children }: { title: string, lastUpdated: string, children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full pt-40 pb-24 px-6 relative z-10">
        <article className="w-full max-w-3xl prose prose-invert prose-p:text-white/60 prose-headings:text-white prose-headings:font-outfit prose-a:text-[#00E5FF] hover:prose-a:text-white prose-a:transition-colors font-inter">
          <h1 className="text-4xl md:text-6xl font-outfit font-bold mb-4 tracking-tight">{title}</h1>
          <p className="text-white/40 text-sm mb-16 pb-8 border-b border-white/10 font-mono">Last Updated: {lastUpdated}</p>
          <div className="space-y-8 leading-relaxed text-[15px] md:text-base">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
