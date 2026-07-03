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
  const dirtyStr = gitDirtyCount > 0 ? `*` : "";
  const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  const sep = <Text color={theme.subtle} dimColor>  ·  </Text>;

  return (
    <Box paddingLeft={1} flexDirection="row" flexShrink={0}>
      <Text color={theme.subtle} dimColor>{modelName || "default"}</Text>
      {sep}
      <Text color={theme.subtle} dimColor>⎇ {gitBranch || "none"}</Text>
      <Text color={theme.warning}>{dirtyStr}</Text>
      {sep}
      <Text color={theme.subtle} dimColor>{kTokens} tokens</Text>
      {sep}
      <Text color={theme.subtle} dimColor>${cost.toFixed(4)}</Text>
      {sep}
      {isExecuting ? (
        <Text color={theme.error}>esc to stop</Text>
      ) : (
        <Text color={theme.subtle} dimColor>ctrl+c to exit</Text>
      )}
    </Box>
  );
};
