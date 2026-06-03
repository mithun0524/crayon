import React, { useState } from "react";
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
  const elapsedMs = Date.now() - startTime;
  const isStalled = elapsedMs > 10000;
  const spinnerColor = isStalled ? theme.warning : theme.brand;
  
  // Drive the animation using tokens so it pulses naturally as the agent streams
  const pulseFactor = Math.floor(tokens / 50);
  const isPulseHigh = pulseFactor % 2 === 0;
  const asteriskColor = isPulseHigh ? spinnerColor : theme.border;

  const kTokens = (tokens / 1000).toFixed(1);

  // If statusText is just "Thinking...", replace it with Crayon-themed words
  const isThinking = statusText === "Thinking...";
  const crayonWords = ["Sketching", "Coloring", "Drawing", "Drafting", "Painting", "Outlining"];
  const [wordIndex] = useState(() => Math.floor(Math.random() * crayonWords.length));
  const displayWord = isThinking ? crayonWords[wordIndex] : statusText;

  const CRAYON_COLORS = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];

  return (
    <Box flexDirection="row" marginTop={0} paddingLeft={2}>
      <Text color={asteriskColor}>✶ </Text>
      
      {isThinking && !isStalled ? (
        <Box flexDirection="row">
          {displayWord.split("").map((char, i) => {
            const colorIndex = (i + pulseFactor) % CRAYON_COLORS.length;
            return <Text key={i} color={CRAYON_COLORS[colorIndex]} bold>{char}</Text>;
          })}
          <Text color={CRAYON_COLORS[pulseFactor % CRAYON_COLORS.length]} bold>... </Text>
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
