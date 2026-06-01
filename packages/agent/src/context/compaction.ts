import type { CoreMessage } from "ai";
import { generateText } from "ai";
import type { ModelConfig } from "../models/router.js";
import { getCompactModel } from "../models/router.js";

const PRESERVE_TAIL = 4;
const TRUNCATE_THRESHOLD = 500;
const TRUNCATE_KEEP = 200;

/**
 * Light compaction: truncate large tool-result messages that are older
 * than the last `PRESERVE_TAIL` messages.
 */
export function microCompact(messages: CoreMessage[]): CoreMessage[] {
  if (messages.length <= PRESERVE_TAIL) return messages;

  const boundary = messages.length - PRESERVE_TAIL;
  return messages.map((msg, idx) => {
    if (idx >= boundary) return msg;

    // Only truncate tool-result messages
    if (msg.role !== "tool") return msg;

    // Tool messages have ToolContent (array of ToolResultPart)
    // We serialize and check the overall size
    const serialized = JSON.stringify(msg.content);
    if (serialized.length <= TRUNCATE_THRESHOLD) return msg;

    // Truncate each tool result part's result field
    if (Array.isArray(msg.content)) {
      const truncatedContent = msg.content.map((part) => {
        if (part.type === "tool-result") {
          const resultStr = typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result);
          return {
            ...part,
            result: resultStr.length > TRUNCATE_KEEP
              ? resultStr.slice(0, TRUNCATE_KEEP) + "... (truncated)"
              : part.result,
          };
        }
        return part;
      });
      return { ...msg, content: truncatedContent } as unknown as CoreMessage;
    }

    return msg;
  });
}

/**
 * Estimate token count from messages (rough: 1 token ≈ 4 chars).
 */
export function estimateTokenCount(messages: CoreMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          chars += part.text.length;
        } else {
          chars += JSON.stringify(part).length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Heavy compaction: summarize older messages into a single summary using a
 * fast LLM call, preserving the last `PRESERVE_TAIL` messages verbatim.
 */
export async function autoCompact(
  messages: CoreMessage[],
  modelConfig: ModelConfig
): Promise<CoreMessage[]> {
  if (messages.length <= PRESERVE_TAIL) return messages;

  const boundary = messages.length - PRESERVE_TAIL;
  const olderMessages = messages.slice(0, boundary);
  const recentMessages = messages.slice(boundary);

  // Build a text representation of older messages for summarization
  const conversationText = olderMessages
    .map((msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return `[${msg.role}]: ${content.slice(0, 2000)}`;
    })
    .join("\n\n");

  try {
    const model = getCompactModel(modelConfig);
    const { text: summary } = await generateText({
      model,
      system:
        "You are a conversation summarizer. Produce a concise but thorough summary " +
        "of the conversation so far. Preserve key decisions, file paths, code snippets, " +
        "tool results, errors, and any important context. Output ONLY the summary, no preamble.",
      messages: [{ role: "user", content: conversationText }],
      maxTokens: 2048,
    });

    const summaryMessage: CoreMessage = {
      role: "assistant",
      content: `[Conversation Summary]\n${summary}`,
    };

    return [summaryMessage, ...recentMessages];
  } catch {
    // If summarization fails, fall back to micro-compaction
    return microCompact(messages);
  }
}

/**
 * Determine whether compaction is needed based on estimated token usage
 * relative to the context window. Returns the appropriate action.
 */
export function getCompactionLevel(
  messages: CoreMessage[],
  contextWindowSize = 128_000
): "none" | "micro" | "auto" {
  const estimated = estimateTokenCount(messages);
  const ratio = estimated / contextWindowSize;

  if (ratio > 0.8) return "auto";
  if (ratio > 0.6) return "micro";
  return "none";
}
