import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

// CRAYON block logo, rendered with a vertical white→cyan gradient (light at the
// top, crayon cyan at the bottom) — the brand gradient.
const LOGO_LINES = [
  " ██████╗ ██████╗   █████╗  ██╗   ██╗  ██████╗  ███╗   ██╗",
  " ██╔════╝ ██╔══██╗ ██╔══██╗ ╚██╗ ██╔╝ ██╔═══██╗ ████╗  ██║",
  " ██║      ██████╔╝ ███████║  ╚████╔╝  ██║   ██║ ██╔██╗ ██║",
  " ██║      ██╔══██╗ ██╔══██║   ╚██╔╝   ██║   ██║ ██║╚██╗██║",
  " ╚██████╗ ██║  ██║ ██║  ██║    ██║    ╚██████╔╝ ██║ ╚████║",
  "  ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═╝  ╚═══╝",
];

// Vertical gradient stops, one per logo row: near-white → crayon cyan.
export const BRAND_GRADIENT = ["#EAFDFF", "#A5F0FB", "#67E8F9", "#22D3EE", "#12BEDC", "#06B6D4"];

interface CrayonLogoProps {
  version?: string;
  compact?: boolean;
}

export const CrayonLogo: React.FC<CrayonLogoProps> = ({ version, compact }) => {
  if (compact) {
    // One-line gradient wordmark for tight spaces.
    const word = "CRAYON";
    return (
      <Text bold>
        {word.split("").map((ch, i) => (
          <Text key={i} color={BRAND_GRADIENT[Math.floor((i / word.length) * BRAND_GRADIENT.length)]}>{ch}</Text>
        ))}
        {version ? <Text color={theme.subtle}> v{version}</Text> : null}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      {LOGO_LINES.map((line, i) => (
        <Text key={i} color={BRAND_GRADIENT[i]} bold>{line}</Text>
      ))}
      <Box marginTop={0} paddingLeft={1}>
        <Text color={theme.brand}>The Autonomous Terminal AI</Text>
        {version ? <Text color={theme.subtle} dimColor>  ·  v{version}</Text> : null}
      </Box>
    </Box>
  );
};
