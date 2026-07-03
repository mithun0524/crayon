import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

interface DiffRendererProps {
  diff: string;
  maxLines?: number;
}

export const DiffRenderer: React.FC<DiffRendererProps> = ({ diff, maxLines = 15 }) => {
  if (!diff) return null;

  // Skip the unified-diff file headers (Index:/===/---/+++) — they add noise.
  const lines = diff
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("Index:") &&
        !l.startsWith("===") &&
        !l.startsWith("--- ") &&
        !l.startsWith("+++ ")
    );

  const visibleLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  return (
    <Box flexDirection="column" paddingLeft={2} marginY={0}>
      {visibleLines.map((line, i) => {
        let color = theme.subtle;
        let dim = false;

        if (line.startsWith("+")) color = theme.diffAddedWord;
        else if (line.startsWith("-")) color = theme.diffRemovedWord;
        else if (line.startsWith("@@")) color = theme.brand;
        else {
          color = theme.text;
          dim = true;
        }

        return (
          <Text key={i} color={color} dimColor={dim}>
            {line || " "}
          </Text>
        );
      })}
      {hasMore && (
        <Text color={theme.subtle} dimColor>
          … +{lines.length - maxLines} more lines
        </Text>
      )}
    </Box>
  );
};
