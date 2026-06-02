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
  
  const isPulseHigh = Math.floor(time / 500) % 2 === 0;
  const asteriskColor = isPulseHigh ? spinnerColor : theme.border;

  const kTokens = (tokens / 1000).toFixed(1);

  // If statusText is just "Thinking...", replace it with Crayon-themed words
  const isThinking = statusText === "Thinking...";
  const crayonWords = ["Sketching", "Coloring", "Drawing", "Drafting", "Painting", "Outlining"];
  const wordIndex = Math.floor(time / 2000) % crayonWords.length;
  const displayWord = isThinking ? crayonWords[wordIndex] : statusText;

  const CRAYON_COLORS = ["#FF6B6B", "#FF9E79", "#FFD93D", "#6BCB77", "#4D96FF", "#9D4EDD"];

  return (
    <Box flexDirection="row" marginTop={0} paddingLeft={2}>
      <Text color={asteriskColor}>✶ </Text>
      
      {isThinking && !isStalled ? (
        <Box flexDirection="row">
          {displayWord.split("").map((char, i) => {
            const colorIndex = (i + Math.floor(time / 150)) % CRAYON_COLORS.length;
            return <Text key={i} color={CRAYON_COLORS[colorIndex]} bold>{char}</Text>;
          })}
          <Text color={CRAYON_COLORS[Math.floor(time / 150) % CRAYON_COLORS.length]} bold>... </Text>
        </Box>
      ) : (
        <Text color={spinnerColor}>{displayWord}... </Text>
      )}

      <Text color={theme.subtle} dimColor>
        ({formatDuration(elapsedMs)} · ∿ {kTokens}k strokes · esc to interrupt)
      </Text>
    </Box>
  );
};
