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
  brand: '#AF87FF',          // Electric violet / Crayon purple
  brandShimmer: '#C7A8FF',   // Lighter violet for shimmer
  border: '#888888',         // Medium gray
  text: '#FFFFFF',           // White
  subtle: '#999999',         // Light gray
  background: '#000000',     // Black
  success: '#4EBA65',        // Bright green
  error: '#FF6B80',          // Bright red
  warning: '#FFC107',        // Bright amber

  diffAdded: '#225C2B',      // Dark green (text/border)
  diffRemoved: '#7A2936',    // Dark red (text/border)
  diffAddedBg: '#122616',    // Very dark green bg
  diffRemovedBg: '#2E1519',  // Very dark red bg
  diffAddedWord: '#38A660',  // Medium green
  diffRemovedWord: '#B3596B',// Medium red

  selectionBg: '#264F78',    // Dark selection blue
  panelBg: '#111111',        // Very dark grey
  promptBg: '#1E1E1E',       // Dark grey for prompt
};

export const theme = darkTheme;
