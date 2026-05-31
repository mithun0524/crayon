'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex flex-col justify-center mt-6 fade-in-up items-center pointer-events-none">
      <nav className="flex items-center justify-between px-6 py-3 max-w-5xl w-[calc(100%-2rem)] mx-4 rounded-full border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.8)] bg-[#121214]/90 backdrop-blur-md pointer-events-auto">
          <Link href="/" className="flex items-center gap-3 focus-ring rounded-lg">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-outfit font-bold text-[#09090B]">
              C
            </div>
            <span className="text-xl font-outfit font-semibold tracking-tight text-white">Crayon</span>
          </Link>
        
        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70 font-inter">
          <Link href="#product" className="hover:text-white transition-colors focus-ring rounded-md px-2 py-1">Product</Link>
          <Link href="#how-it-works" className="hover:text-white transition-colors focus-ring rounded-md px-2 py-1">How it Works</Link>
          <Link href="#pricing" className="hover:text-white transition-colors focus-ring rounded-md px-2 py-1">Pricing</Link>
          <Link href="#docs" className="hover:text-white transition-colors focus-ring rounded-md px-2 py-1">Docs</Link>
        </div>
        
        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Link href="https://github.com/crayon" className="text-sm font-medium text-white/70 hover:text-white transition-colors font-inter focus-ring rounded-md px-2 py-1">
            GitHub
          </Link>
          <button className="bg-white text-[#09090B] px-5 py-2 rounded-full font-inter font-medium text-sm hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] focus-ring">
            Get Started
          </button>
        </div>

        {/* Mobile Hamburger */}
        <button 
          className="md:hidden text-white/80 p-2 focus-ring rounded-md"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile Drawer */}
      <div 
        className={`md:hidden absolute top-[calc(100%+1rem)] w-[calc(100%-2rem)] max-w-sm border border-white/10 rounded-3xl p-6 flex flex-col gap-6 bg-[#121214]/95 backdrop-blur-xl pointer-events-auto origin-top transition-all duration-300 ease-out shadow-2xl ${isMobileMenuOpen ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="flex flex-col gap-4 font-inter text-sm font-medium text-white/80">
          <Link href="#product" className="p-2 hover:bg-white/5 rounded-lg focus-ring" onClick={() => setIsMobileMenuOpen(false)}>Product</Link>
          <Link href="#how-it-works" className="p-2 hover:bg-white/5 rounded-lg focus-ring" onClick={() => setIsMobileMenuOpen(false)}>How it Works</Link>
          <Link href="#pricing" className="p-2 hover:bg-white/5 rounded-lg focus-ring" onClick={() => setIsMobileMenuOpen(false)}>Pricing</Link>
          <Link href="#docs" className="p-2 hover:bg-white/5 rounded-lg focus-ring" onClick={() => setIsMobileMenuOpen(false)}>Docs</Link>
          <Link href="https://github.com/crayon" className="p-2 hover:bg-white/5 rounded-lg focus-ring" onClick={() => setIsMobileMenuOpen(false)}>GitHub</Link>
        </div>
        <button className="w-full bg-white text-[#09090B] px-5 py-3 rounded-xl font-inter font-bold text-sm hover:bg-gray-200 transition-all focus-ring">
          Get Started Free
        </button>
      </div>
    </div>
  );
}
