import React, { useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface ThinkingMessageProps {
  thinking: string;
  isCollapsed?: boolean;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({ thinking, isCollapsed: initialCollapsed = false }) => {
  const [collapsed] = useState(initialCollapsed);

  if (!thinking) return null;

  const cleanThinking = thinking.trim();
  if (cleanThinking.length === 0) return null;

  if (collapsed) {
    const firstLine = cleanThinking.split("\n")[0] || "";
    const truncated = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
    return (
      <Box flexDirection="row" marginTop={0} marginBottom={1}>
        <Text color={theme.subtle} dimColor>
          ▸ Thought: {truncated}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} width="100%">
      <Box flexDirection="row">
        <Text color={theme.subtle} italic dimColor>
          ∴ Thinking...
        </Text>
      </Box>
      <Box paddingLeft={2} marginTop={0}>
        <Text color={theme.subtle} italic dimColor>
          {cleanThinking}
        </Text>
      </Box>
    </Box>
  );
};
