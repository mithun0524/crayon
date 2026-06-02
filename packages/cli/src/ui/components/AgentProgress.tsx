import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface AgentProgressProps {
  statusText: string;
  tokens?: number;
  startTime?: number;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

export const AgentProgress: React.FC<AgentProgressProps> = ({
  statusText,
  tokens = 0,
  startTime = Date.now(),
}) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let start = Date.now();
    const interval = setInterval(() => {
      setTime(Date.now() - start);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const elapsedMs = Date.now() - startTime;
  const isStalled = elapsedMs > 10000;
  const spinnerColor = isStalled ? theme.warning : theme.brand;
  
  // Create a gentle pulsing effect on the asterisk instead of a spinning char
  const isPulseHigh = Math.floor(time / 500) % 2 === 0;
  const asteriskColor = isPulseHigh ? spinnerColor : theme.border;

  const kTokens = (tokens / 1000).toFixed(1);

  return (
    <Box flexDirection="row" marginTop={0} paddingLeft={2}>
      <Text color={asteriskColor}>✶ </Text>
      <Text color={spinnerColor}>{statusText}... </Text>
      <Text color={theme.subtle} dimColor>
        ({formatDuration(elapsedMs)} · ↓ {kTokens}k tokens · esc to interrupt)
      </Text>
    </Box>
  );
};
