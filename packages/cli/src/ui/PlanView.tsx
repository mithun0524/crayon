import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "./theme.js";

interface PlanViewProps {
  steps: string[];
  currentStepIndex: number;
  isExecuting: boolean;
}

export const PlanView: React.FC<PlanViewProps> = ({ steps, currentStepIndex, isExecuting }) => {
  if (!steps || steps.length === 0) return null;

  const MAX_VISIBLE = 5;
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
      <Text bold color={theme.brand}>● Update Todos</Text>
      
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
                {isExecuting ? <Spinner type="dots" /> : "☐"} 
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
