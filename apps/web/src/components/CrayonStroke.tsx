'use client';
import { useRef } from 'react';
import { useGSAP, ScrollTrigger, prefersReducedMotion } from '../lib/gsap';

// A hand-drawn crayon underline that draws itself on when scrolled into view.
// Place it absolutely under a word (caller controls position via className).
export default function CrayonStroke({
  color = 'var(--accent-ink)',
  className,
  variant = 'underline',
}: {
  color?: string;
  className?: string;
  variant?: 'underline' | 'scribble';
}) {
  const ref = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        el.classList.add('drawn');
        return;
      }
      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        onEnter: () => el.classList.add('drawn'),
        onLeaveBack: () => el.classList.remove('drawn'),
      });
      return () => st.kill();
    },
    { scope: ref }
  );

  const d =
    variant === 'scribble'
      ? 'M4 12 C 50 2, 70 22, 120 12 S 200 2, 250 14 S 290 20, 296 10'
      : 'M4 15 C 70 7, 120 20, 160 12 S 250 7, 296 14';

  return (
    <svg
      ref={ref}
      className={`crayon-stroke pointer-events-none ${className ?? ''}`}
      viewBox="0 0 300 24"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
    </svg>
  );
}
