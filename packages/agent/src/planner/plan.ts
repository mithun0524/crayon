import { generateText } from "ai";
import { getPlanningModel, type ModelConfig } from "../models/router.js";

export type TaskMode = "chat" | "advisory" | "coding";

const GREETING =
  /^(hey|hi|hello|yo|sup|thanks|thank you|ok|okay|cool|help|what can you do|who are you|good morning|good evening|how are you|bye|goodbye)[!.?\s]*$/i;

const ADVISORY =
  /^(?:how (?:do|can|should|would|to)|what (?:is|are|does|do|should)|why (?:is|are|do|does)|explain|tell me (?:about|how)|can you explain|describe|where (?:is|are|do|does))/i;

const CODING_INTENT =
  /\b(fix|implement|refactor|debug|install|commit|edit file|write tests|run tests|add (?:a |the )?(?:file|route|api|component|test|feature|endpoint)|create (?:a |the )?(?:file|route|api|component|test|feature|endpoint)|update (?:the )?(?:file|code|component)|remove (?:the )?(?:file|code)|delete (?:the )?(?:file|code))\b/i;

export function classifyTask(task: string): TaskMode {
  const t = task.trim();
  if (!t) return "chat";

  if (GREETING.test(t.toLowerCase())) return "chat";

  if (ADVISORY.test(t)) return "advisory";

  if (/[`/\\]|\.(ts|js|py|go|tsx|jsx|md|json)\b/.test(t)) return "coding";
  if (CODING_INTENT.test(t)) return "coding";

  // "build X" alone is ambiguous — treat as advisory unless clearly in-repo
  if (/\bbuild\b/i.test(t) && t.split(/\s+/).length <= 10) return "advisory";

  if (t.split(/\s+/).length <= 6) return "chat";

  return "coding";
}

/** @deprecated use classifyTask */
export function isConversationalTask(task: string): boolean {
  return classifyTask(task) === "chat";
}

export async function createPlan(
  task: string,
  config: ModelConfig,
  context?: string
): Promise<string[]> {
  const mode = classifyTask(task);
  if (mode !== "coding") return [];

  const model = getPlanningModel(config);

  const { text } = await generateText({
    model,
    system: `You plan coding tasks for the CURRENT workspace repository only.
Return ONLY a JSON array of 3-7 concise engineering subtasks focused on this codebase.
Do NOT give generic product/business advice. Do NOT mention deployment, SEO, or marketing unless the repo is clearly a web app and the task requires it.
Example: ["Search codebase for auth module", "Add login route in src/api", "Write tests"]`,
    prompt: `Task: ${task}\n\n${context ? `Context:\n${context}` : ""}\n\nReturn subtasks as JSON array:`,
  });

  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as string[];
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed.slice(0, 7);
    }
  } catch {
    // fall through
  }

  return [task];
}
