import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { verbForTurn, formatDuration } from "../workingVerb.js";

interface AgentProgressProps {
  statusText: string;
  tokens?: number;
  startTime?: number;
}

// Braille spinner — every frame is exactly one cell wide, so the text after it
// never shifts. (The old dingbat frames ✢✳∗✻✽ had varying widths → jitter.)
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const AgentProgress: React.FC<AgentProgressProps> = ({
  statusText,
  tokens = 0,
  startTime = Date.now(),
}) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 120);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = Date.now() - startTime;
  const isStalled = elapsedMs > 30000;
  const spinnerColor = isStalled ? theme.warning : theme.brand;

  const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  // Generic waiting → whimsical verb; a specific tool status stays as-is.
  const label = statusText === "Thinking..." ? `${verbForTurn(startTime).present}…` : statusText;

  return (
    <Box flexDirection="row" marginTop={0}>
      <Text color={spinnerColor} bold>{FRAMES[frame]} </Text>
      <Text color={theme.text}>{label} </Text>
      <Text color={theme.subtle} dimColor>
        ({formatDuration(elapsedMs)} · {kTokens} tokens · esc to interrupt)
      </Text>
    </Box>
  );
};
