import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageHeader from '../../components/PageHeader';
import HowItWorks from '../../components/HowItWorks';
import FeatureShowcase from '../../components/FeatureShowcase';

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Navbar />
      <main className="flex-1 flex flex-col items-center w-full">
        <PageHeader 
          title="Engineered for autonomy" 
          description="Crayon isn't just an autocomplete tool. It is a fully autonomous agent that understands architecture, writes tests, and ships features."
          badge="Platform Features"
        />
        <HowItWorks />
        <div className="pb-32 w-full">
          <FeatureShowcase />
        </div>
      </main>
      <Footer />
    </div>
  );
}
