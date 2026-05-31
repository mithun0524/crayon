import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

// Standard braille spinner frames
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface AgentProgressProps {
  statusText: string;
  tokens?: number;
  startTime?: number; // timestamp in ms
  modelName?: string;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

// Intercept standard hex colors and return an RGB object
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1]!, 16), g: parseInt(result[2]!, 16), b: parseInt(result[3]!, 16) }
    : { r: 255, g: 255, b: 255 };
}

function interpolate(c1: ReturnType<typeof hexToRgb>, c2: ReturnType<typeof hexToRgb>, factor: number) {
  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * factor)},${Math.round(
    c1.g + (c2.g - c1.g) * factor
  )},${Math.round(c1.b + (c2.b - c1.b) * factor)})`;
}

export const AgentProgress: React.FC<AgentProgressProps> = ({
  statusText,
  tokens = 0,
  startTime = Date.now(),
  modelName,
}) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let start = Date.now();
    const interval = setInterval(() => {
      setTime(Date.now() - start);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  const frameIndex = Math.floor(time / 80);
  const spinnerChar = FRAMES[frameIndex % FRAMES.length];

  const glimmerSpeed = 150;
  const elapsedMs = Date.now() - startTime;
  const showTokensAndTimer = elapsedMs > 1000 || tokens > 0;
  
  const isStalled = elapsedMs > 10000;
  const spinnerColor = isStalled ? theme.warning : theme.brand;
  const displayStatus = isStalled ? `${statusText} (taking longer than expected...)` : statusText;
  const cycleLength = displayStatus.length + 20;
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const glimmerIndex = (cyclePosition % cycleLength) - 5;

  const baseRgb = hexToRgb(theme.text);
  const shimmerRgb = hexToRgb(theme.brandShimmer);

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={2}>
        <Text color={spinnerColor}>{spinnerChar}</Text>
      </Box>
      <Box flexDirection="row">
        {displayStatus.split("").map((char, i) => {
          const distance = Math.abs(i - glimmerIndex);
          const isShimmer = distance <= 2;
          let color = theme.text;
          
          if (isShimmer) {
            const factor = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.3;
            color = interpolate(baseRgb, shimmerRgb, factor);
          }
          
          return (
            <Text key={i} color={color} italic>
              {char}
            </Text>
          );
        })}
      </Box>
      
      {showTokensAndTimer && (
        <Box paddingLeft={1} flexDirection="row">
          <Text color={theme.subtle} dimColor> · </Text>
          <Text color={theme.subtle} dimColor>{formatDuration(elapsedMs)}</Text>
          <Text color={theme.subtle} dimColor> · </Text>
          <Text color={theme.subtle} dimColor>{tokens} tokens</Text>
          {modelName && (
            <>
              <Text color={theme.subtle} dimColor> · </Text>
              <Text color={theme.subtle} dimColor>{modelName}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
