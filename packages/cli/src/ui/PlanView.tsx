import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "./theme.js";

interface PlanViewProps {
  steps: string[];
  currentStepIndex: number;
  isExecuting: boolean;
}

export const PlanView: React.FC<PlanViewProps> = ({ steps, currentStepIndex, isExecuting }) => {
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setShimmer(s => !s), 800);
    return () => clearInterval(timer);
  }, []);

  if (!steps || steps.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={theme.brand}>Plan:</Text>
      {steps.map((step, index) => {
        const isDone = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;

        if (isDone) {
          return (
            <Box key={index} paddingLeft={2}>
              <Text color={theme.success}>✓ </Text>
              <Text color={theme.subtle}>{step}</Text>
            </Box>
          );
        }

        if (isCurrent) {
          const color = isExecuting && shimmer ? theme.brandShimmer : theme.brand;
          return (
            <Box key={index} paddingLeft={2}>
              <Text color={color}>
                {isExecuting ? (
                  // @ts-expect-error type mismatch
                  <Spinner type="dots" />
                ) : "●"}{" "}
              </Text>
              <Text color={color} bold>{step}</Text>
            </Box>
          );
        }

        return (
          <Box key={index} paddingLeft={2}>
            <Text color={theme.border}>○ </Text>
            <Text color={theme.subtle}>{step}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
