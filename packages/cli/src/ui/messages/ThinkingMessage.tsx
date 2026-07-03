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
    const truncated = firstLine.length > 72 ? firstLine.slice(0, 69) + "…" : firstLine;
    return (
      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.subtle} dimColor italic>
          ✻ {truncated}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      <Text color={theme.subtle} italic dimColor>✻ Thinking…</Text>
      <Box paddingLeft={2}>
        <Text color={theme.subtle} italic dimColor>{cleanThinking}</Text>
      </Box>
    </Box>
  );
};
