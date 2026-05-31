import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Integrations" 
          description="Connect Crayon to your existing workflow. Native support for GitHub, GitLab, Jira, and Slack."
          badge="Ecosystem"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          Marketplace coming soon.
        </div>
      </main>
      <Footer />
    </div>
  );
}
