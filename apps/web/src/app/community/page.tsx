import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';

export default function CommunityPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Community" 
          description="Join the top 1% of engineers building the autonomous future."
          badge="Discord"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          Discord invite coming soon.
        </div>
      </main>
      <Footer />
    </div>
  );
}
