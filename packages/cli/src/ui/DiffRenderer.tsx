import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

interface DiffRendererProps {
  diff: string;
  maxLines?: number;
}

type Row = { kind: "add" | "del" | "ctx"; ln: number | null; text: string };

/** Parse a unified diff into rows with line numbers, dropping file/hunk headers. */
function parseDiff(diff: string): Row[] {
  const rows: Row[] = [];
  let oldLn = 0, newLn = 0;
  for (const line of diff.split("\n")) {
    if (/^(Index:|={3,}|--- |\+\+\+ |\\ )/.test(line)) continue;
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { oldLn = +h[1]; newLn = +h[2]; continue; }
    if (line.startsWith("+")) { rows.push({ kind: "add", ln: newLn++, text: line.slice(1) }); }
    else if (line.startsWith("-")) { rows.push({ kind: "del", ln: oldLn++, text: line.slice(1) }); }
    else { rows.push({ kind: "ctx", ln: newLn, text: line.replace(/^ /, "") }); oldLn++; newLn++; }
  }
  return rows;
}

export const DiffRenderer: React.FC<DiffRendererProps> = ({ diff, maxLines = 15 }) => {
  if (!diff) return null;
  const rows = parseDiff(diff);
  if (rows.length === 0) return null;

  const adds = rows.filter((r) => r.kind === "add").length;
  const dels = rows.filter((r) => r.kind === "del").length;
  const gw = String(Math.max(1, ...rows.map((r) => r.ln ?? 0))).length;
  const visible = rows.slice(0, maxLines);

  return (
    <Box flexDirection="column">
      <Text color={theme.subtle} dimColor>
        <Text color={theme.diffAddedWord}>+{adds}</Text> <Text color={theme.diffRemovedWord}>-{dels}</Text>
      </Text>
      {visible.map((r, i) => {
        const num = String(r.ln ?? "").padStart(gw, " ");
        const sign = r.kind === "add" ? "+" : r.kind === "del" ? "-" : " ";
        const color = r.kind === "add" ? theme.diffAddedWord : r.kind === "del" ? theme.diffRemovedWord : theme.subtle;
        return (
          <Box key={i} flexDirection="row">
            <Text color={theme.border}>{num} </Text>
            <Text color={color} dimColor={r.kind === "ctx"}>{sign} </Text>
            <Box flexGrow={1}><Text color={color} dimColor={r.kind === "ctx"}>{r.text || " "}</Text></Box>
          </Box>
        );
      })}
      {rows.length > maxLines && (
        <Text color={theme.subtle} dimColor>  … +{rows.length - maxLines} more lines</Text>
      )}
    </Box>
  );
};
