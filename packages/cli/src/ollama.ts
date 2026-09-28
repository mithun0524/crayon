// One place for talking to the Ollama server outside the agent: onboarding,
// boot-time model list, and /model all read from here.

/** Same server the agent's provider uses (router.ts), minus its /v1 suffix. */
export function ollamaHost(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

export interface OllamaModel {
  name: string;
  size?: number;
}

/** Chat-capable models on the server, or null when it can't be reached. */
export async function fetchOllamaModels(timeoutMs = 2000): Promise<OllamaModel[] | null> {
  try {
    const res = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: OllamaModel[] };
    // Embedding models can't chat; offering one only sets up a broken first run.
    return (data.models ?? []).filter((m) => !/embed/i.test(m.name));
  } catch {
    return null;
  }
}

export function describeOllamaModel(m: OllamaModel): string {
  if (m.name.endsWith("-cloud")) return "Ollama Cloud";
  return m.size ? `${(m.size / 1024 ** 3).toFixed(1)} GB · local` : "local";
}
