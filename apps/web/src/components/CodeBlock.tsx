'use client';
import { useState } from 'react';

// A dark terminal-style code block that reads the same in light and dark mode
// (always on-dark), with a copy button. `label` shows a small caption bar.
export default function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="on-dark group relative overflow-hidden rounded-xl border border-line bg-ink-900">
      {label && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
          <span className="font-mono text-[11px] tracking-wide text-faint">{label}</span>
        </div>
      )}
      <button
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-md bg-paper/5 text-faint opacity-0 transition-opacity hover:bg-paper/10 hover:text-paper group-hover:opacity-100"
        style={label ? { top: '2.75rem' } : undefined}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed text-paper/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
