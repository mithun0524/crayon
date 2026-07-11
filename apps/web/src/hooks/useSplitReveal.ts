'use client';
import { useRef, type RefObject } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';
import { splitText, type SplitType } from '../lib/splitText';

interface Options {
  type?: SplitType;
  stagger?: number;
  duration?: number;
  y?: number;
  start?: string;
  delay?: number;
}

/**
 * Split an element's text and reveal it char-by-char (or word) on scroll:
 * each glyph flips up from behind its baseline. Waits for fonts so split
 * positions are correct, guards reduced-motion, reverts on cleanup.
 * Adapted from kinetic-portfolio.
 */
export function useSplitReveal<T extends HTMLElement>(options: Options = {}) {
  const ref = useRef<T>(null);
  const {
    type = 'chars',
    stagger = 0.018,
    duration = 0.9,
    y = 110,
    start = 'top 85%',
    delay = 0,
  } = options;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1 });
        return;
      }

      let cleanup = () => {};
      document.fonts.ready.then(() => {
        if (!ref.current) return;
        const split = splitText(el, type);
        const targets = type === 'chars' ? split.chars : split.words;
        gsap.set(el, { opacity: 1 });

        gsap.from(targets, {
          yPercent: y,
          opacity: 0,
          rotateX: -40,
          transformOrigin: '50% 100%',
          duration,
          delay,
          ease: 'power4.out',
          stagger,
          scrollTrigger: {
            trigger: el,
            start,
            toggleActions: 'play none none reverse',
          },
        });
        cleanup = split.revert;
        ScrollTriggerRefresh();
      });

      return () => cleanup();
    },
    { scope: ref }
  );

  return ref as RefObject<T>;
}

// Recalculate trigger positions once split spans change layout height.
function ScrollTriggerRefresh() {
  import('../lib/gsap').then(({ ScrollTrigger }) => ScrollTrigger.refresh());
}
