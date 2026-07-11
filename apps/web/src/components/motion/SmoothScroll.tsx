'use client';
import type { ReactNode } from 'react';
import { useLenis } from '../../hooks/useLenis';

// Drives Lenis smooth scroll wired into GSAP ScrollTrigger. Reduced-motion is
// honored inside the hook.
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useLenis();
  return <>{children}</>;
}
