'use client';
import { createElement } from 'react';
import { useSplitReveal } from '../../hooks/useSplitReveal';
import type { SplitType } from '../../lib/splitText';

/**
 * Char-by-char (or word) text reveal — each glyph flips up from its baseline
 * as the block scrolls in. Text stays in the DOM for SEO and is mirrored to
 * screen readers via aria-label inside the split.
 */
export default function TextReveal({
  text,
  className,
  as = 'span',
  delay = 0,
  type = 'chars',
  stagger,
}: {
  text: string;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
  delay?: number;
  type?: SplitType;
  stagger?: number;
}) {
  const ref = useSplitReveal<HTMLElement>({ delay, type, ...(stagger ? { stagger } : {}) });
  return createElement(
    as,
    { ref, className, style: { opacity: 0, display: 'inline-block' } },
    text
  );
}
