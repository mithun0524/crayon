'use client';
import { useRef, type RefObject } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const offset: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 40 },
  down: { y: -40 },
  left: { x: 40 },
  right: { x: -40 },
  none: {},
};

/**
 * Fade + slide a block into view on scroll. Direct children are staggered
 * when `stagger` > 0, so a single wrapper can orchestrate a group. Callers
 * render the wrapper with inline opacity:0 to avoid a flash before hydration.
 */
export function useReveal<T extends HTMLElement>(opts: {
  direction?: Direction;
  delay?: number;
  stagger?: number;
  start?: string;
} = {}) {
  const ref = useRef<T>(null);
  const { direction = 'up', delay = 0, stagger = 0, start = 'top 85%' } = opts;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, x: 0, y: 0 });
        return;
      }

      // Wrapper always ends visible; animated targets are it or its children.
      gsap.set(el, { opacity: 1 });
      const targets = stagger > 0 ? (Array.from(el.children) as HTMLElement[]) : el;

      gsap.fromTo(
        targets,
        { opacity: 0, ...offset[direction] },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration: 0.85,
          delay,
          stagger,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start, toggleActions: 'play none none reverse' },
        }
      );
    },
    { scope: ref }
  );

  return ref as RefObject<T>;
}
