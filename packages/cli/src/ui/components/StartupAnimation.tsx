import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface StartupAnimationProps {
  version: string;
  workspaceName: string;
  onComplete: () => void;
}

const CRAYON_COLORS = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];

export const StartupAnimation: React.FC<StartupAnimationProps> = ({ version, workspaceName, onComplete }) => {
  const [charsRevealed, setCharsRevealed] = useState(0);
  const text = "Crayon";
  
  useEffect(() => {
    if (charsRevealed >= text.length) {
      const timer = setTimeout(onComplete, 300);
      return () => clearTimeout(timer);
    }
    
    const timer = setTimeout(() => {
      setCharsRevealed(prev => prev + 1);
    }, 70); // drawing speed
    
    return () => clearTimeout(timer);
  }, [charsRevealed, text.length, onComplete]);

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Text color={theme.subtle}>⬡ </Text>
      {text.split("").map((char, i) => {
        if (i < charsRevealed) {
          return <Text key={i} color={CRAYON_COLORS[i % CRAYON_COLORS.length]} bold>{char}</Text>;
        }
        return null;
      })}
      {charsRevealed < text.length ? (
        <Text color={CRAYON_COLORS[charsRevealed % CRAYON_COLORS.length]}>█</Text>
      ) : (
        <Text color={theme.subtle}> v{version} · Workspace: {workspaceName}</Text>
      )}
    </Box>
  );
};
