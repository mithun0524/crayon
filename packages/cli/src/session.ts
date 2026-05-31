import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CoreMessage } from "@crayon/agent";

interface SessionData {
  id: string;
  timestamp: string;
  history: CoreMessage[];
  chatLog: { sender: string; text: string }[];
}

export async function saveSession(workspaceRoot: string, history: CoreMessage[], chatLog: any[]): Promise<void> {
  const sessionDir = path.join(workspaceRoot, ".crayon", "sessions");
  if (!existsSync(sessionDir)) {
    await mkdir(sessionDir, { recursive: true });
  }

  // We save to a "latest.json" for easy resume, and maybe a timestamped one later
  const sessionPath = path.join(sessionDir, "latest.json");
  const data: SessionData = {
    id: "latest",
    timestamp: new Date().toISOString(),
    history,
    chatLog,
  };

  await writeFile(sessionPath, JSON.stringify(data, null, 2), "utf-8");
}

export async function loadSession(workspaceRoot: string): Promise<SessionData | null> {
  const sessionPath = path.join(workspaceRoot, ".crayon", "sessions", "latest.json");
  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = await readFile(sessionPath, "utf-8");
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}
