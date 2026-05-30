import React from "react";
import { Box, Text } from "ink";

interface DiffRendererProps {
  diff: string;
  maxLines?: number;
}

export const DiffRenderer: React.FC<DiffRendererProps> = ({ diff, maxLines = 15 }) => {
  if (!diff) return null;

  const lines = diff.split("\n");
  const visibleLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginY={1}>
      {visibleLines.map((line, i) => {
        let color = "white";
        let isDim = false;

        if (line.startsWith("+") && !line.startsWith("+++")) {
          color = "green";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          color = "red";
        } else if (line.startsWith("@@")) {
          color = "cyan";
          isDim = true;
        } else if (line.startsWith("Index:") || line.startsWith("===") || line.startsWith("---") || line.startsWith("+++")) {
          color = "blue";
          isDim = true;
        } else {
          isDim = true;
        }

        return (
          <Text key={i} color={color} dimColor={isDim}>
            {line}
          </Text>
        );
      })}
      {hasMore && (
        <Text color="yellow" dimColor>
          ... and {lines.length - maxLines} more lines of changes
        </Text>
      )}
    </Box>
  );
};
