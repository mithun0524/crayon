import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';

export default function BlogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Engineering Blog" 
          description="Deep dives into AI agents, abstract syntax trees, and building the future of software engineering."
          badge="Blog"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          No posts yet. Check back soon.
        </div>
      </main>
      <Footer />
    </div>
  );
}
