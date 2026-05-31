import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

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
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={0} marginY={1}>
      {visibleLines.map((line, i) => {
        let fgColor = theme.subtle;
        let bgColor: string | undefined = undefined;
        let isDim = false;

        if (line.startsWith("+") && !line.startsWith("+++")) {
          fgColor = theme.diffAddedWord;
          bgColor = theme.diffAddedBg;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          fgColor = theme.diffRemovedWord;
          bgColor = theme.diffRemovedBg;
        } else if (line.startsWith("@@")) {
          fgColor = theme.brand;
        } else if (line.startsWith("Index:") || line.startsWith("===") || line.startsWith("---") || line.startsWith("+++")) {
          fgColor = theme.subtle;
        } else {
          fgColor = theme.text;
          isDim = true;
        }

        return (
          <Box key={i} width="100%" backgroundColor={bgColor} paddingX={1}>
            <Text color={fgColor} dimColor={isDim}>
              {line}
            </Text>
          </Box>
        );
      })}
      {hasMore && (
        <Box width="100%" paddingX={1}>
          <Text color={theme.warning}>
            ... and {lines.length - maxLines} more lines of changes
          </Text>
        </Box>
      )}
    </Box>
  );
};
