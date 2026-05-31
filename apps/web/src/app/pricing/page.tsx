import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';
import PricingComponent from '../../components/Pricing';
import FAQ from '../../components/FAQ';

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Simple, transparent pricing" 
          description="Start building for free. Scale effortlessly as your team and project complexity grows."
          badge="Pricing"
        />
        <div className="w-full -mt-10">
          <PricingComponent />
        </div>
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
