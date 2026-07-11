import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import SmoothScroll from "../components/motion/SmoothScroll";
import CookieBanner from "../components/CookieBanner";
import { SITE } from "../lib/site";
import "./globals.css";

// Editorial display face — high-contrast serif for large headlines and italic
// emphasis. Deliberately unexpected for a developer tool.
const instrument = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crayon — The Autonomous Terminal AI",
  description:
    "Crayon is an autonomous AI coding agent that lives in your terminal. It reads your codebase, plans, executes, and self-heals until the job is done.",
  metadataBase: new URL(SITE.demo),
  openGraph: {
    title: "Crayon — The Autonomous Terminal AI",
    description: SITE.tagline,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrument.variable} ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          // Set the theme before first paint: stored choice → system preference
          // → light. Avoids a flash of the wrong theme.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('crayon-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {/* Fixed atmosphere layers */}
        <div className="grain pointer-events-none fixed inset-0 z-[60]" aria-hidden />
        <div className="waxy pointer-events-none fixed inset-0 z-[59]" aria-hidden />
        <div className="grid-lines pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <SmoothScroll>{children}</SmoothScroll>
        <CookieBanner />
      </body>
    </html>
  );
}
