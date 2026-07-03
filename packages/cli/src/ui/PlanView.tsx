import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

interface PlanViewProps {
  steps: string[];
  currentStepIndex: number;
  isExecuting: boolean;
}

export const PlanView: React.FC<PlanViewProps> = ({ steps, currentStepIndex }) => {
  if (!steps || steps.length === 0) return null;
  if (currentStepIndex >= steps.length) return null;

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
      <Text color={theme.brand} bold>Tasks</Text>

      {hiddenCompleted > 0 && (
        <Box paddingLeft={2}>
          <Text color={theme.subtle} dimColor>☒ {hiddenCompleted} completed</Text>
        </Box>
      )}

      {visibleSteps.map((step, localIdx) => {
        const globalIdx = startIdx + localIdx;
        const isDone = globalIdx < currentStepIndex;
        const isCurrent = globalIdx === currentStepIndex;

        if (isDone) {
          return (
            <Box key={globalIdx} paddingLeft={2}>
              <Text color={theme.success}>☒ </Text>
              <Text color={theme.subtle} strikethrough dimColor>{step}</Text>
            </Box>
          );
        }
        if (isCurrent) {
          return (
            <Box key={globalIdx} paddingLeft={2}>
              <Text color={theme.brand} bold>▸ {step}</Text>
            </Box>
          );
        }
        return (
          <Box key={globalIdx} paddingLeft={2}>
            <Text color={theme.subtle}>☐ {step}</Text>
          </Box>
        );
      })}

      {hiddenPending > 0 && (
        <Box paddingLeft={2}>
          <Text color={theme.subtle} dimColor>… +{hiddenPending} more</Text>
        </Box>
      )}
    </Box>
  );
};
