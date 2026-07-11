import Link from 'next/link';
import { SITE } from '../lib/site';
import CrayonMark from './CrayonMark';

const COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Blog', href: '/blog' },
      { label: 'Community', href: '/community' },
      { label: 'npm package', href: SITE.npm },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Cookies', href: '/cookie-policy' },
      { label: 'Security', href: '/security' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative z-10 w-full border-t border-line bg-ink-950 px-6 pb-12 pt-20">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-12 md:grid-cols-5">
        <div className="col-span-2">
          <Link href="/" className="mb-5 flex w-fit items-center gap-2">
            <CrayonMark size={30} />
            <span className="text-xl font-semibold tracking-tight text-paper">Crayon</span>
          </Link>
          <p className="mb-7 max-w-xs leading-relaxed text-dim">
            The autonomous AI coding agent for your terminal. Open source, MIT licensed.
          </p>
          <div className="flex items-center gap-3">
            <a href="https://x.com/mithun0524" target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-full border border-line text-faint transition-colors hover:border-accent hover:text-paper" aria-label="X (Twitter)">
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href={SITE.repo} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-full border border-line text-faint transition-colors hover:border-accent hover:text-paper" aria-label="GitHub">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
            </a>
          </div>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <h4 className="kicker mb-5">{col.title}</h4>
            <ul className="space-y-3 text-sm text-dim">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="transition-colors hover:text-paper">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-16 flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-line pt-8 md:flex-row">
        <p className="font-mono text-xs text-faint">
          © {new Date().getFullYear()} Crayon · {SITE.license} · open source
        </p>
        <p className="font-mono text-xs text-faint">v{SITE.version}</p>
      </div>
    </footer>
  );
}
