import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

/**
 * Minimal, dependency-free markdown → Ink renderer. marked-terminal is broken
 * against marked v15 (list items never get inline-parsed), and rendering to Ink
 * elements gives us real layout (wrapping, gutters) and theme colors. Handles
 * the subset agents actually emit: headings, bold/italic/inline-code, bullet &
 * numbered lists, and blockquotes. Fenced code is handled by the caller.
 */

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(INLINE).map((p, i) => {
    if (!p) return null;
    const key = `${keyBase}-${i}`;
    if ((p.startsWith("**") && p.endsWith("**")) || (p.startsWith("__") && p.endsWith("__")))
      return <Text key={key} bold color={theme.text}>{p.slice(2, -2)}</Text>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <Text key={key} color={theme.brandShimmer}>{p.slice(1, -1)}</Text>;
    if (p.startsWith("[") && p.includes("](")) {
      const label = p.slice(1, p.indexOf("]"));
      return <Text key={key} color={theme.brand} underline>{label}</Text>;
    }
    if ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_")))
      return <Text key={key} italic color={theme.text}>{p.slice(1, -1)}</Text>;
    return <Text key={key}>{p}</Text>;
  });
}

interface Block { type: "h" | "p" | "li" | "quote"; text: string; level?: number; marker?: string; }

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") { flush(); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const bul = line.match(/^(\s*)[-*•]\s+(.*)$/);
    const num = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const q = line.match(/^>\s?(.*)$/);
    if (h) { flush(); blocks.push({ type: "h", level: h[1].length, text: h[2] }); }
    else if (bul) { flush(); blocks.push({ type: "li", text: bul[2], marker: "•", level: Math.floor(bul[1].length / 2) }); }
    else if (num) { flush(); blocks.push({ type: "li", text: num[3], marker: `${num[2]}.`, level: Math.floor(num[1].length / 2) }); }
    else if (q) { flush(); blocks.push({ type: "quote", text: q[1] }); }
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

export const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parse(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return <Box key={i} marginTop={i ? 1 : 0}><Text bold color={theme.brand}>{inline(b.text, `h${i}`)}</Text></Box>;
        if (b.type === "quote")
          return (
            <Box key={i} flexDirection="row">
              <Text color={theme.border}>│ </Text><Text color={theme.subtle} italic>{inline(b.text, `q${i}`)}</Text>
            </Box>
          );
        if (b.type === "li")
          return (
            <Box key={i} flexDirection="row" paddingLeft={(b.level || 0) * 2}>
              <Text color={theme.brand}>{b.marker} </Text>
              <Box flexGrow={1}><Text color={theme.text}>{inline(b.text, `li${i}`)}</Text></Box>
            </Box>
          );
        return <Box key={i}><Text color={theme.text}>{inline(b.text, `p${i}`)}</Text></Box>;
      })}
    </Box>
  );
};
