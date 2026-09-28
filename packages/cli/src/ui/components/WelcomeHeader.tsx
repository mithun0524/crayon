import React from "react";
import os from "node:os";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { CrayonLogo } from "./CrayonLogo.js";

interface WelcomeHeaderProps {
  version: string;
  model: string;
  provider?: string;
  mode: string;
  cwd: string;
  columns: number;
  rows: number;
}

/** ~-relative, then middle-elided so the path never wraps inside the card. */
export function displayPath(p: string, max: number): string {
  const home = os.homedir();
  const rel = home && (p === home || p.startsWith(home + "/")) ? "~" + p.slice(home.length) : p;
  if (rel.length <= max) return rel;
  const keep = Math.max(4, max - 1);
  const head = Math.ceil(keep / 3);
  return rel.slice(0, head) + "…" + rel.slice(rel.length - (keep - head));
}

/**
 * Boot card: what you're talking to and where, plus the three things a new
 * user needs to know. The big block logo only shows when the terminal has room
 * for it — on a normal-height window it would push the prompt half off-screen.
 */
export const WelcomeHeader: React.FC<WelcomeHeaderProps> = ({ version, model, provider, mode, cwd, columns, rows }) => {
  const width = Math.min(Math.max(40, columns - 3), 76);
  const valueWidth = width - 14; // border + padding + label column
  const showBigLogo = rows >= 34 && columns >= 64;

  const row = (label: string, value: React.ReactNode) => (
    <Box>
      <Box width={8}><Text color={theme.subtle}>{label}</Text></Box>
      <Text color={theme.text}>{value}</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      {showBigLogo && <Box marginBottom={1}><CrayonLogo version={version} /></Box>}
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={2} width={width}>
        {!showBigLogo && (
          <Box marginBottom={1}>
            <CrayonLogo compact version={version} />
            <Text color={theme.subtle}>  ·  The Autonomous Terminal AI</Text>
          </Box>
        )}
        {row("model", <>{model || "not set"}{provider ? <Text color={theme.subtle}>  {provider}</Text> : null}</>)}
        {row("mode", mode)}
        {row("cwd", displayPath(cwd, valueWidth))}
        <Box marginTop={1}>
          <Text color={theme.subtle}>
            <Text color={theme.brand}>/</Text> commands  ·  <Text color={theme.brand}>@</Text> mention files  ·  <Text color={theme.brand}>?</Text> shortcuts  ·  <Text color={theme.brand}>shift+tab</Text> mode
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
