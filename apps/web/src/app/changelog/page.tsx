import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';

export default function ChangelogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Changelog" 
          description="We ship fast. See the latest features, improvements, and bug fixes to the Crayon engine."
          badge="Updates"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          Version 1.0.0 initializing...
        </div>
      </main>
      <Footer />
    </div>
  );
}
