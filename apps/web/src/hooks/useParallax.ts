'use client';
import { useRef, type RefObject } from 'react';
import { gsap, useGSAP, prefersReducedMotion, isMobile } from '../lib/gsap';

/**
 * Scroll-linked vertical parallax. `speed` > 0 recedes (moves slower than
 * scroll). Scrub + ease:none means the scrollbar is the easing.
 * Adapted from kinetic-portfolio.
 */
export function useParallax<T extends HTMLElement>(speed = 0.3) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const distance = (isMobile() ? speed * 0.5 : speed) * 200;

      gsap.fromTo(
        el,
        { yPercent: -distance / 10 },
        {
          yPercent: distance / 10,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        }
      );
    },
    { scope: ref }
  );

  return ref as RefObject<T>;
}
