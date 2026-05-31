import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SocialProof from '../components/SocialProof';
import HowItWorks from '../components/HowItWorks';
import FeatureShowcase from '../components/FeatureShowcase';
import Testimonials from '../components/Testimonials';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import CallToAction from '../components/CallToAction';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col bg-transparent">
      {/* Dark gradient mesh replacing the massive aurora blobs for performance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[20%] w-[50vw] h-[50vw] bg-[#00E5FF]/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-[#00E5FF]/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <Navbar />
      
      <main className="flex-1 flex flex-col items-center w-full">
        <Hero />
        <SocialProof />
        <HowItWorks />
        <FeatureShowcase />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}
