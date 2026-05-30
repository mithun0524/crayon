import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface StreamViewProps {
  text: string;
  isStreaming: boolean;
}

export const StreamView: React.FC<StreamViewProps> = ({ text, isStreaming }) => {
  const [showCursor, setShowCursor] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    if (!isStreaming) {
      setShowCursor(false);
      return;
    }

    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 400);

    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!text && !isStreaming) return null;

  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      <Text bold color="green">Crayon:</Text>
      <Box flexDirection="row" flexWrap="wrap">
        <Text color="white">
          {text}
          {isStreaming && showCursor && <Text color="green">▋</Text>}
        </Text>
      </Box>
    </Box>
  );
};
