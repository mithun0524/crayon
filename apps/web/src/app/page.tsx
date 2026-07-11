import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SocialProof from '../components/SocialProof';
import HowItWorks from '../components/HowItWorks';
import FeatureShowcase from '../components/FeatureShowcase';
import Palette from '../components/Palette';
import Principles from '../components/Testimonials';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import CallToAction from '../components/CallToAction';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col bg-ink-950">
      {/* Ambient hero glow — one warm-cool wash, kept subtle */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-[15%] left-1/2 h-[55vw] w-[55vw] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-8%] h-[40vw] w-[40vw] rounded-full bg-coral/[0.04] blur-[120px]" />
      </div>

      <Navbar />
      <main className="flex w-full flex-1 flex-col items-center">
        <Hero />
        <SocialProof />
        <HowItWorks />
        <FeatureShowcase />
        <Palette />
        <Principles />
        <Pricing />
        <FAQ />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
