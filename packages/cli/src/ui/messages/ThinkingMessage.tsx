import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface ThinkingMessageProps {
  thinking: string;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({ thinking }) => {
  if (!thinking) return null;

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      <Box flexDirection="row">
        <Text color={theme.subtle} italic dimColor>
          ∴ Thinking...
        </Text>
      </Box>
      <Box paddingLeft={2} marginTop={0}>
        <Text color={theme.subtle} italic dimColor>
          {thinking}
        </Text>
      </Box>
    </Box>
  );
};
