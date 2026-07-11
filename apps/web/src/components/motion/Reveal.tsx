'use client';
import type { ReactNode } from 'react';
import { useReveal } from '../../hooks/useReveal';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

/**
 * Scroll-reveal wrapper (GSAP + ScrollTrigger). Fades + slides its content in
 * once. Set `stagger` > 0 to stagger its direct children instead.
 */
export default function Reveal({
  children,
  delay = 0,
  direction = 'up',
  className,
  stagger = 0,
  start,
}: {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
  stagger?: number;
  start?: string;
}) {
  const ref = useReveal<HTMLDivElement>({ direction, delay, stagger, start });
  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
