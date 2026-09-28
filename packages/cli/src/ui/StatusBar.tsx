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
  const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  // Local/free models cost nothing — "$0.0000" is noise, not information.
  const costStr = cost <= 0 ? "" : cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
  const sep = <Text color={theme.subtle} dimColor>  ·  </Text>;

  return (
    <Box paddingLeft={1} flexDirection="row" flexShrink={0}>
      <Text color={theme.brand}>{modelName || "loading…"}</Text>
      {gitBranch ? (
        <>
          {sep}
          <Text color={theme.subtle}>⎇ {gitBranch}</Text>
          {gitDirtyCount > 0 ? <Text color={theme.warning}> ±{gitDirtyCount}</Text> : null}
        </>
      ) : null}
      {tokens > 0 ? <>{sep}<Text color={theme.subtle}>{kTokens} tokens</Text></> : null}
      {costStr ? <>{sep}<Text color={theme.success}>{costStr}</Text></> : null}
      {sep}
      {isExecuting ? (
        <Text color={theme.error} bold>esc to stop</Text>
      ) : (
        <Text color={theme.subtle}>ctrl+c to exit</Text>
      )}
    </Box>
  );
};
