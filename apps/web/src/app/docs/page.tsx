import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';

export default function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Documentation" 
          description="Learn how to configure Crayon, write agentic workflows, and automate your engineering team."
          badge="Coming Soon"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          $ pnpm install @crayon/docs (pending release)
        </div>
      </main>
      <Footer />
    </div>
  );
}
