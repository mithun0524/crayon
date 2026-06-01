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
  brand: '#A8A29E',          // Warm gray / minimal
  brandShimmer: '#E7E5E4',   // Lighter gray for shimmer
  border: '#3F3F46',         // Dark gray border
  text: '#F4F4F5',           // Off-white text
  subtle: '#71717A',         // Muted gray
  background: '#09090B',     // Near black
  success: '#22C55E',        // Minimal green
  error: '#EF4444',          // Minimal red
  warning: '#F59E0B',        // Minimal amber

  diffAdded: '#166534',      
  diffRemoved: '#991B1B',    
  diffAddedBg: '#052E16',    
  diffRemovedBg: '#450A0A',  
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
