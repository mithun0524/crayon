import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface CustomCommand {
  cmd: string;        // "/review"
  desc: string;       // first heading or line of the file
  template: string;   // full file body; $ARGUMENTS is replaced at invoke time
}

/**
 * Load user-defined slash commands from .crayon/commands/*.md (workspace) and
 * ~/.crayon/commands/*.md (global). A file `review.md` becomes `/review`; its
 * content is the prompt template, with `$ARGUMENTS` replaced by whatever the
 * user typed after the command. Workspace commands shadow global ones.
 */
export async function loadCustomCommands(workspaceRoot: string, homeDir: string): Promise<CustomCommand[]> {
  const seen = new Map<string, CustomCommand>();
  // Global first so workspace files override on name collision.
  for (const dir of [path.join(homeDir, ".crayon", "commands"), path.join(workspaceRoot, ".crayon", "commands")]) {
    if (!existsSync(dir)) continue;
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const f of files) {
      const name = f.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (!name) continue;
      try {
        const template = (await readFile(path.join(dir, f), "utf-8")).trim();
        if (!template) continue;
        const firstLine = template.split("\n")[0].replace(/^#+\s*/, "").trim();
        const desc = firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine || "Custom command";
        seen.set(name, { cmd: `/${name}`, desc, template });
      } catch {
        // unreadable file — skip
      }
    }
  }
  return [...seen.values()];
}

/** Expand a command template with the user's arguments. */
export function expandTemplate(template: string, args: string): string {
  if (template.includes("$ARGUMENTS")) {
    return template.split("$ARGUMENTS").join(args.trim());
  }
  // No placeholder: append args (if any) after the template.
  return args.trim() ? `${template}\n\n${args.trim()}` : template;
}
