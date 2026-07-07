import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CoreMessage } from "crayon-agent";

// Per-file write queue: pushMessage fires saveSession on every message
// (unawaited), so overlapping writes to one <id>.json could interleave and
// corrupt it. Serialize per path and write atomically (temp → rename).
const writeChains = new Map<string, Promise<void>>();

export interface SessionData {
  id: string;
  timestamp: string;
  title: string;
  history: CoreMessage[];
  chatLog: any[];
}

export interface SessionMeta {
  id: string;
  timestamp: string;
  title: string;
  messageCount: number;
}

function sessionsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".crayon", "sessions");
}

/** Derive a short human title from the first user message. */
function deriveTitle(chatLog: any[]): string {
  const firstUser = chatLog.find((m) => m?.sender === "user" && m?.text?.trim());
  const raw = (firstUser?.text || "").trim().replace(/\s+/g, " ");
  if (!raw) return "Untitled session";
  return raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
}

/** Persist a session to its own <id>.json file. */
export async function saveSession(
  workspaceRoot: string,
  id: string,
  history: CoreMessage[],
  chatLog: any[]
): Promise<void> {
  const dir = sessionsDir(workspaceRoot);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const data: SessionData = {
    id,
    timestamp: new Date().toISOString(),
    title: deriveTitle(chatLog),
    history,
    chatLog,
  };
  const finalPath = path.join(dir, `${id}.json`);
  const payload = JSON.stringify(data, null, 2);

  const prev = writeChains.get(finalPath) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const tmp = `${finalPath}.${process.pid}.tmp`;
      await writeFile(tmp, payload, "utf-8");
      await rename(tmp, finalPath); // atomic swap — readers never see a partial file
    });
  writeChains.set(finalPath, next);
  await next;
  if (writeChains.get(finalPath) === next) writeChains.delete(finalPath);
}

/** Load a session by id, or the most recent one if no id is given. */
export async function loadSession(
  workspaceRoot: string,
  id?: string
): Promise<SessionData | null> {
  const dir = sessionsDir(workspaceRoot);
  try {
    if (id) {
      const p = path.join(dir, `${id}.json`);
      if (!existsSync(p)) return null;
      return JSON.parse(await readFile(p, "utf-8")) as SessionData;
    }
    // Most recent by timestamp.
    const all = await listSessions(workspaceRoot);
    if (all.length === 0) return null;
    return loadSession(workspaceRoot, all[0].id);
  } catch {
    return null;
  }
}

/** List all saved sessions, newest first. */
export async function listSessions(workspaceRoot: string): Promise<SessionMeta[]> {
  const dir = sessionsDir(workspaceRoot);
  if (!existsSync(dir)) return [];
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  const metas: SessionMeta[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(await readFile(path.join(dir, f), "utf-8")) as SessionData;
      metas.push({
        id: data.id ?? f.replace(/\.json$/, ""),
        timestamp: data.timestamp ?? "",
        title: data.title ?? deriveTitle(data.chatLog || []),
        messageCount: Array.isArray(data.chatLog) ? data.chatLog.length : 0,
      });
    } catch {
      // skip corrupt file
    }
  }
  metas.sort((a, b) => (a.timestamp === b.timestamp ? 0 : a.timestamp < b.timestamp ? 1 : -1));
  return metas;
}
