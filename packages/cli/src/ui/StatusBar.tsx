import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

interface StatusBarProps {
  workspaceName: string;
  gitBranch: string;
  gitDirtyCount: number;
  tokens: number;
  cost: number;
  isExecuting: boolean;
  modelName?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  gitBranch,
  gitDirtyCount,
  tokens,
  cost,
  isExecuting,
  modelName,
}) => {
  const dirtyStr = gitDirtyCount > 0 ? ` (+${gitDirtyCount})` : "";
  const costStr = cost.toFixed(4);

  // Determine max context window
  let maxContext = "200k"; // Default
  if (modelName?.includes("gpt-4")) maxContext = "128k";
  else if (modelName?.includes("gpt-3.5")) maxContext = "16k";
  else if (modelName?.includes("gemini")) maxContext = "1m"; // gemini 1.5 pro/flash
  else if (modelName?.includes("claude-3")) maxContext = "200k";

  const kTokens = tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens;

  return (
    <Box marginTop={1} paddingLeft={1} flexDirection="row" alignItems="center">
      <Text color={theme.subtle} dimColor> ⎇ </Text>
      <Text color={theme.brand}>{gitBranch || "none"}</Text>
      <Text color={theme.warning}>{dirtyStr}</Text>

      <Text color={theme.subtle} dimColor>  •  </Text>
      <Text color={theme.subtle} dimColor>Tokens: </Text>
      <Text color={theme.warning}>{kTokens}/{maxContext}</Text>
      <Text color={theme.success}> (${costStr})</Text>

      {!isExecuting && (
        <>
          <Text color={theme.subtle} dimColor>  •  </Text>
          <Text color={theme.subtle} dimColor>[ctrl+c] Exit</Text>
        </>
      )}

      {isExecuting && (
        <>
          <Text color={theme.subtle} dimColor>  •  </Text>
          <Text color={theme.error} bold>[esc] Stop Agent</Text>
        </>
      )}
    </Box>
  );
};
