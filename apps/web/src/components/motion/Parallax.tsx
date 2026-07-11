'use client';
import type { ReactNode } from 'react';
import { useParallax } from '../../hooks/useParallax';

// Scroll-linked vertical parallax wrapper (GSAP scrub).
export default function Parallax({
  children,
  speed = 0.3,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useParallax<HTMLDivElement>(speed);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
