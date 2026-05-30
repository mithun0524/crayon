import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface PlanViewProps {
  steps: string[];
  currentStepIndex: number;
  isExecuting: boolean;
}

export const PlanView: React.FC<PlanViewProps> = ({ steps, currentStepIndex, isExecuting }) => {
  if (!steps || steps.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">Plan:</Text>
      {steps.map((step, index) => {
        const isDone = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;

        if (isDone) {
          return (
            <Box key={index} paddingLeft={2}>
              <Text color="green">✓ </Text>
              <Text dimColor>{step}</Text>
            </Box>
          );
        }

        if (isCurrent) {
          return (
            <Box key={index} paddingLeft={2}>
              <Text color="blue">
                {isExecuting ? <Spinner type="dots" /> : "●"}{" "}
              </Text>
              <Text color="blue" bold>{step}</Text>
            </Box>
          );
        }

        return (
          <Box key={index} paddingLeft={2}>
            <Text color="gray">○ </Text>
            <Text color="gray" dimColor>{step}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
