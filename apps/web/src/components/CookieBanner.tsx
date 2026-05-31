'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user has already acknowledged the cookie policy
    const consent = localStorage.getItem('crayon_cookie_consent');
    if (!consent) {
      // Small delay so it doesn't jarringly pop up the millisecond the page loads
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('crayon_cookie_consent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('crayon_cookie_consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-[calc(100%-3rem)] bg-[#121214] border border-white/10 p-6 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <svg className="w-5 h-5 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h3 className="text-white font-outfit font-medium">We use cookies</h3>
      </div>
      <p className="text-sm text-white/60 font-inter mb-6 leading-relaxed">
        We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
        Read our <Link href="/cookie-policy" className="text-[#00E5FF] hover:text-white transition-colors">Cookie Policy</Link>.
      </p>
      <div className="flex gap-3 w-full">
        <button 
          onClick={handleDecline}
          className="flex-1 py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-all font-inter text-sm focus-ring font-medium"
        >
          Decline
        </button>
        <button 
          onClick={handleAccept}
          className="flex-1 py-2.5 rounded-lg bg-white text-[#09090B] hover:bg-gray-200 transition-all font-inter text-sm focus-ring font-medium shadow-[0_0_15px_rgba(255,255,255,0.1)]"
        >
          Accept All
        </button>
      </div>
    </div>
  );
}
