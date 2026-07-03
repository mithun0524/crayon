export interface Theme {
  brand: string;
  brandShimmer: string;
  border: string;
  text: string;
  subtle: string;
  background: string;
  success: string;
  error: string;
  warning: string;
  
  // Diffs
  diffAdded: string;
  diffRemoved: string;
  diffAddedBg: string;
  diffRemovedBg: string;
  diffAddedWord: string;
  diffRemovedWord: string;

  // UI
  selectionBg: string;
  panelBg: string;
  promptBg: string;
}

export const darkTheme: Theme = {
  brand: '#22D3EE',          // Crayon teal/cyan — the signal color
  brandShimmer: '#67E8F9',   // Lighter crayon cyan
  border: '#52525B',         // Border (lifted for visibility)
  text: '#FAFAFA',           // Bright near-white body text
  subtle: '#A1A1AA',         // Muted gray — still readable on black
  background: '#09090B',     // Near black
  success: '#4ADE80',        // Green
  error: '#F87171',          // Red
  warning: '#FBBF24',        // Amber

  diffAdded: '#22C55E',      // Green (Claude-style additions)
  diffRemoved: '#EF4444',    // Red (Claude-style removals)
  diffAddedBg: 'transparent',
  diffRemovedBg: 'transparent',
  diffAddedWord: '#22C55E',
  diffRemovedWord: '#EF4444',

  selectionBg: '#27272A',    // Dark selection
  panelBg: '#18181B',        // Very dark grey panel
  promptBg: '#09090B',       // Dark background
};

import { lightTheme } from "./themes/light.js";
import { highContrastTheme } from "./themes/high-contrast.js";

function loadTheme(): Theme {
  const themeName = process.env.CRAYON_THEME || 'dark';
  if (themeName === 'light') {
    return lightTheme;
  } else if (themeName === 'high-contrast') {
    return highContrastTheme;
  }
  return darkTheme;
}

export const theme = loadTheme();

/** Selectable accent presets for the `/color` command. */
export interface Accent { name: string; label: string; brand: string; shimmer: string; }
export const ACCENTS: Accent[] = [
  { name: "teal",      label: "Crayon Teal",      brand: "#22D3EE", shimmer: "#67E8F9" },
  { name: "violet",    label: "Electric Violet",  brand: "#A855F7", shimmer: "#C084FC" },
  { name: "magenta",   label: "Crayon Magenta",   brand: "#EC4899", shimmer: "#F472B6" },
  { name: "coral",     label: "Crayon Coral",     brand: "#FB7185", shimmer: "#FDA4AF" },
  { name: "rose",      label: "Rose Red",         brand: "#F43F5E", shimmer: "#FB7185" },
  { name: "tangerine", label: "Tangerine",        brand: "#FB923C", shimmer: "#FDBA74" },
  { name: "amber",     label: "Amber",            brand: "#FBBF24", shimmer: "#FCD34D" },
  { name: "lime",      label: "Lime Punch",       brand: "#A3E635", shimmer: "#BEF264" },
  { name: "emerald",   label: "Emerald",          brand: "#34D399", shimmer: "#6EE7B7" },
  { name: "sky",       label: "Sky Blue",         brand: "#38BDF8", shimmer: "#7DD3FC" },
  { name: "indigo",    label: "Indigo",           brand: "#818CF8", shimmer: "#A5B4FC" },
  { name: "clay",      label: "Clay (Claude)",    brand: "#D97757", shimmer: "#E9A07F" },
];

/** Mutate the shared theme's accent in place. Returns false for unknown names. */
export function applyAccent(name: string): boolean {
  const a = ACCENTS.find((x) => x.name === name);
  if (!a) return false;
  theme.brand = a.brand;
  theme.brandShimmer = a.shimmer;
  return true;
}

// Startup override: CRAYON_ACCENT env wins; config is applied by the app.
if (process.env.CRAYON_ACCENT) applyAccent(process.env.CRAYON_ACCENT);
