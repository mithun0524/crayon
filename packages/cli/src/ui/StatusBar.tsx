import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  workspaceName: string;
  gitBranch: string;
  gitDirtyCount: number;
  tokens: number;
  cost: number;
  isExecuting: boolean;
  isChatMode: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  workspaceName,
  gitBranch,
  gitDirtyCount,
  tokens,
  cost,
  isExecuting,
  isChatMode,
}) => {
  const dirtyIndicator = gitDirtyCount > 0 ? ` *${gitDirtyCount}` : "";
  const costStr = cost.toFixed(4);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Divider */}
      <Text color="gray">────────────────────────────────────────────────────────────────────────────────</Text>
      
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text dimColor>workspace: </Text>
          <Text color="cyan" bold>{workspaceName}</Text>
          <Text dimColor>  branch: </Text>
          <Text color="magenta">{gitBranch || "none"}</Text>
          {gitDirtyCount > 0 && <Text color="yellow" bold>{dirtyIndicator}</Text>}
        </Box>

        <Box>
          <Text dimColor>tokens: </Text>
          <Text color="yellow">{tokens.toLocaleString()}</Text>
          <Text dimColor>  ~${costStr}</Text>
        </Box>
      </Box>

      {/* Hints Bar */}
      <Box justifyContent="space-between" paddingX={1} marginTop={0}>
        <Box>
          {isChatMode ? (
            <Text color="gray" dimColor>Commands: /clear, /diff, /cost, /files, /compact</Text>
          ) : (
            <Text color="gray" dimColor>Autonomous running mode</Text>
          )}
        </Box>
        <Box>
          {isExecuting ? (
            <Text color="red" bold>[esc] stop execution</Text>
          ) : (
            <Text color="gray" dimColor>[ctrl+c] exit</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
