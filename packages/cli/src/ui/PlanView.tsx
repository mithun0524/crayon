import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

interface PlanViewProps {
  steps: string[];
  currentStepIndex: number;
  isExecuting: boolean;
}

const VERBS = [
  "Sketching details...",
  "Blending colors...",
  "Sharpening thoughts...",
  "Drawing outlines...",
  "Shading context..."
];

const crayonColors = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];

const ShimmeringVerb: React.FC<{ isExecuting: boolean }> = ({ isExecuting }) => {
  // Pick one verb per mount — stays fixed for this task run
  const [verbIdx] = useState(() => Math.floor(Math.random() * VERBS.length));
  const [colorOffset, setColorOffset] = useState(0);

  useEffect(() => {
    if (!isExecuting) return;
    const colorTimer = setInterval(() => {
      setColorOffset((prev) => (prev + 1) % crayonColors.length);
    }, 200);
    return () => clearInterval(colorTimer);
  }, [isExecuting]);

  if (!isExecuting) {
    return <Text bold color={theme.brand}>▶ Task List</Text>;
  }

  const text = VERBS[verbIdx];
  return (
    <Text bold>
      <Text color={theme.brand}>▶ </Text>
      {text.split("").map((char, i) => (
        <Text key={i} color={crayonColors[(i + colorOffset) % crayonColors.length]}>
          {char}
        </Text>
      ))}
    </Text>
  );
};

export const PlanView: React.FC<PlanViewProps> = ({ steps, currentStepIndex, isExecuting }) => {
  if (!steps || steps.length === 0) return null;

  // If all steps are done, hide the plan view
  if (currentStepIndex >= steps.length) return null;

  // Max 5 items total visible (including the "+X more" if needed)
  const MAX_VISIBLE = steps.length > 5 ? 4 : 5;
  
  let startIdx = Math.max(0, currentStepIndex - 1);
  let endIdx = startIdx + MAX_VISIBLE;

  if (endIdx > steps.length) {
    endIdx = steps.length;
    startIdx = Math.max(0, endIdx - MAX_VISIBLE);
  }

  const hiddenCompleted = startIdx;
  const hiddenPending = steps.length - endIdx;

  const visibleSteps = steps.slice(startIdx, endIdx);

  return (
    <Box flexDirection="column" marginY={1}>
      <ShimmeringVerb isExecuting={isExecuting} />
      
      {hiddenCompleted > 0 && (
        <Box paddingLeft={2}>
          <Text color={theme.border}>└ </Text>
          <Text color={theme.subtle} dimColor>{hiddenCompleted} completed...</Text>
        </Box>
      )}

      {visibleSteps.map((step, localIdx) => {
        const globalIdx = startIdx + localIdx;
        const isDone = globalIdx < currentStepIndex;
        const isCurrent = globalIdx === currentStepIndex;
        
        const prefix = (globalIdx === 0 && hiddenCompleted === 0 && localIdx === 0) ? "└ " : "  ";

        if (isDone) {
          return (
            <Box key={globalIdx} paddingLeft={2}>
              <Text color={theme.border}>{prefix}</Text>
              <Text color={theme.success}>☒ </Text>
              <Text color={theme.success} strikethrough>{step}</Text>
            </Box>
          );
        }

        if (isCurrent) {
          const color = isExecuting ? theme.success : theme.brand;
          return (
            <Box key={globalIdx} paddingLeft={2}>
              <Text color={theme.border}>{prefix}</Text>
              <Text color={color}>
                {isExecuting ? "➤" : "☐"} 
              </Text>
              <Text color={color} bold> {step}</Text>
            </Box>
          );
        }

        return (
          <Box key={globalIdx} paddingLeft={2}>
            <Text color={theme.border}>{prefix}</Text>
            <Text color={theme.subtle}>☐ {step}</Text>
          </Box>
        );
      })}

      {hiddenPending > 0 && (
        <Box paddingLeft={2}>
          <Text color={theme.border}>  </Text>
          <Text color={theme.subtle} dimColor>... +{hiddenPending} more tasks</Text>
        </Box>
      )}
    </Box>
  );
};
