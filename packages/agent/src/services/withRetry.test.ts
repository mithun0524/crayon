import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./withRetry.js";

describe("withRetry", () => {
  it("returns result on successful call", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const { result } = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and 500", async () => {
    const err429 = new Error("Rate Limited") as any;
    err429.status = 429;

    const err500 = new Error("Internal Server Error") as any;
    err500.status = 500;

    const fn = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockRejectedValueOnce(err500)
      .mockResolvedValue("success");

    const onRetry = vi.fn();
    const { result } = await withRetry(fn, { 
      baseDelayMs: 1, // keeping delay small for tests
      onRetry 
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("aborts on 401", async () => {
    const err401 = new Error("Unauthorized") as any;
    err401.status = 401;

    const fn = vi.fn().mockRejectedValue(err401);

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("does NOT retry a hard daily-quota 429 (fails fast)", async () => {
    const errQuota = new Error(
      "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"
    ) as any;
    errQuota.status = 429;

    const fn = vi.fn().mockRejectedValue(errQuota);

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(/free-models-per-day/);
    expect(fn).toHaveBeenCalledTimes(1); // no pointless retries on a daily cap
  });

  it("respects retry-after header for 429", async () => {
    const err429 = new Error("Rate Limited") as any;
    err429.status = 429;
    err429.headers = { "retry-after": "1" }; // 1 second

    const fn = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValue("success");

    const startTime = Date.now();
    const { result } = await withRetry(fn, { baseDelayMs: 1 });
    const duration = Date.now() - startTime;

    expect(result).toBe("success");
    // Depending on timing it could be slightly less than 1000 due to setTimeout precision
    // but we can check if it's at least close to 1000.
    expect(duration).toBeGreaterThanOrEqual(950);
  });
});
