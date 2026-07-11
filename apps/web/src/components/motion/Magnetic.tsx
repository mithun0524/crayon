'use client';
import type { ReactNode } from 'react';
import { useMagnetic } from '../../hooks/useMagnetic';

// Wraps an interactive element so it drifts toward the pointer (desktop only).
export default function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useMagnetic<HTMLDivElement>(strength);
  return (
    <div ref={ref} className={`inline-block ${className ?? ''}`}>
      {children}
    </div>
  );
}
