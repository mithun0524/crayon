export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  multiplier?: number;
  maxDelayMs?: number;
  maxTokens?: number;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

interface RetryableError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  headers?: Record<string, string> | Headers;
  response?: {
    status?: number;
    headers?: Record<string, string> | Headers;
  };
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

function getStatusCode(err: RetryableError): number | undefined {
  return err.status ?? err.statusCode ?? err.response?.status;
}

function getRetryAfterMs(err: RetryableError): number | undefined {
  const headers = err.headers ?? err.response?.headers;
  if (!headers) return undefined;

  let value: string | null = null;
  if (headers instanceof Headers) {
    value = headers.get("retry-after");
  } else if (typeof headers === "object") {
    value = (headers as Record<string, string>)["retry-after"] ?? null;
  }

  if (!value) return undefined;

  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

function isContextOverflowError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("context") ||
    msg.includes("token") ||
    msg.includes("too long") ||
    msg.includes("maximum context") ||
    msg.includes("context_length_exceeded")
  );
}

function isRetryableError(err: RetryableError): boolean {
  const status = getStatusCode(err);
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  // Network errors
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
    return true;
  }

  return false;
}

export interface WithRetryResult<T> {
  result: T;
  maxTokens?: number;
}

export async function withRetry<T>(
  fn: (opts: { maxTokens?: number }) => Promise<T>,
  options?: RetryOptions
): Promise<WithRetryResult<T>> {
  const maxRetries = options?.maxRetries ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  const multiplier = options?.multiplier ?? 2;
  const maxDelayMs = options?.maxDelayMs ?? 32_000;
  const onRetry = options?.onRetry;

  let currentMaxTokens = options?.maxTokens;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn({ maxTokens: currentMaxTokens });
      return { result, maxTokens: currentMaxTokens };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      if (attempt >= maxRetries) break;

      const retryableErr = error as RetryableError;

      // Context overflow — reduce maxTokens and retry
      if (isContextOverflowError(error)) {
        const prev = currentMaxTokens ?? 128_000;
        currentMaxTokens = Math.floor(prev * 0.75);
        const delay = baseDelayMs;
        onRetry?.(error, attempt + 1, delay);
        await sleep(delay);
        continue;
      }

      // Retryable HTTP errors
      if (!isRetryableError(retryableErr)) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(multiplier, attempt);
      const jitter = Math.random() * baseDelayMs;
      let delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      // Respect retry-after header for 429s
      const status = getStatusCode(retryableErr);
      if (status === 429) {
        const retryAfter = getRetryAfterMs(retryableErr);
        if (retryAfter !== undefined) {
          delay = Math.max(delay, retryAfter);
        }
      }

      onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("withRetry: max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
