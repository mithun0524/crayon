import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface AgentProgressProps {
  statusText: string;
  tokens?: number;
  startTime?: number;
}

function formatDuration(ms: number) {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

// Braille spinner — every frame is exactly one cell wide, so the text after it
// never shifts. (The old dingbat frames ✢✳∗✻✽ had varying widths → jitter.)
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Whimsical present-continuous "working" verbs (Claude-Code idiom). Picked
// once per turn (keyed off startTime) so it stays stable across re-renders
// but varies run-to-run.
const VERBS = [
  "Brewing", "Cooking", "Churning", "Baking", "Sautéing", "Simmering",
  "Percolating", "Whisking", "Marinating", "Crunching", "Noodling",
  "Conjuring", "Untangling", "Wrangling", "Pondering", "Tinkering",
];

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
  const verb = VERBS[Math.floor(startTime / 1000) % VERBS.length];
  const label = statusText === "Thinking..." ? `${verb}…` : statusText;

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
