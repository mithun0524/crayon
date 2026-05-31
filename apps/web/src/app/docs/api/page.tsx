import React from 'react';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';
import PageHeader from '../../../components/PageHeader';

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="API Reference" 
          description="Build custom agentic workflows using the Crayon Engine REST API."
          badge="v1.0"
        />
        <div className="py-20 text-center text-white/50 font-mono">
          API Documentation initializing...
        </div>
      </main>
      <Footer />
    </div>
  );
}
