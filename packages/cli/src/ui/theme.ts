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
  brand: '#D97757',          // Claude clay/terracotta accent — the signal color
  brandShimmer: '#E9A07F',   // Lighter clay
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
