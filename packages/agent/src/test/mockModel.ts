import { MockLanguageModelV1, simulateReadableStream } from "ai/test";
import type { LanguageModelV1StreamPart } from "ai";

/**
 * A scripted language model for driving CrayonAgent.run() in tests.
 *
 * Each entry in `steps` is one model "turn": the stream parts it emits.
 * streamText consumes them in order — emit tool-call parts with
 * finishReason "tool-calls" to make the loop execute tools, then a later
 * turn with text + finishReason "stop" to finish.
 *
 * Usage:
 *   scriptedModel([
 *     [textPart("Done."), finishPart("stop")],
 *   ])
 */
export function scriptedModel(steps: LanguageModelV1StreamPart[][]): {
  model: MockLanguageModelV1;
  calls: () => number;
} {
  let call = 0;
  const model = new MockLanguageModelV1({
    modelId: "mock-model",
    doStream: async () => {
      // Repeat the last scripted step if the loop asks for more turns than
      // were scripted (keeps a runaway loop from throwing on undefined).
      const chunks = steps[Math.min(call, steps.length - 1)] ?? [finishPart("stop")];
      call++;
      return {
        stream: simulateReadableStream({ chunks }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  });
  return { model, calls: () => call };
}

export function textPart(text: string): LanguageModelV1StreamPart {
  return { type: "text-delta", textDelta: text };
}

export function reasoningPart(text: string): LanguageModelV1StreamPart {
  return { type: "reasoning", textDelta: text };
}

export function toolCallPart(
  toolName: string,
  args: unknown,
  toolCallId = `call_${Math.floor(performance.now())}_${toolName}`
): LanguageModelV1StreamPart {
  return {
    type: "tool-call",
    toolCallType: "function",
    toolCallId,
    toolName,
    args: JSON.stringify(args),
  };
}

export function finishPart(
  finishReason: "stop" | "tool-calls" | "length" = "stop",
  usage = { promptTokens: 10, completionTokens: 10 }
): LanguageModelV1StreamPart {
  return { type: "finish", finishReason, usage };
}
