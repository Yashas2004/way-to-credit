import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, registerAuthFailureHandler, registerOutsideAccessWindowHandler } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest 401 handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Reset to no-ops so one test's registration can't leak into the next.
    registerAuthFailureHandler(() => undefined);
    registerOutsideAccessWindowHandler(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries exactly once after a single 401, refreshing first", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }, 200)) // refresh
      .mockResolvedValueOnce(jsonResponse({ data: "hello" }, 200)); // retried original

    const result = await apiGet<{ data: string }>("/api/resource");

    expect(result).toEqual({ data: "hello" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
  });

  it("does not loop if the retried request 401s again", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }, 200)) // refresh succeeds
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "still no" } }, 401),
      ); // retry still 401s

    await expect(apiGet("/api/resource")).rejects.toMatchObject({ status: 401 });
    // original + refresh + exactly one retry — never a second refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws without retrying the original request if refresh itself fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "refresh failed" } }, 401),
      );

    await expect(apiGet("/api/resource")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls the registered auth-failure handler when refresh fails", async () => {
    const onFailure = vi.fn();
    registerAuthFailureHandler(onFailure);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401));

    await expect(apiGet("/api/resource")).rejects.toBeTruthy();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("concurrent 401s across multiple requests share a single in-flight refresh call", async () => {
    const callCountByUrl = new Map<string, number>();

    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      const count = (callCountByUrl.get(url) ?? 0) + 1;
      callCountByUrl.set(url, count);

      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse({ status: "ok" }, 200));
      }
      // Each distinct resource path 401s on its first attempt, succeeds on its retry.
      if (count === 1) {
        return Promise.resolve(
          jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401),
        );
      }
      return Promise.resolve(jsonResponse({ ok: true }, 200));
    });

    const results = await Promise.all([
      apiGet("/api/resource-a"),
      apiGet("/api/resource-b"),
      apiGet("/api/resource-c"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(callCountByUrl.get("/api/auth/refresh")).toBe(1);
  });

  it("surfaces RESOURCE_BUSY, OUTSIDE_ACCESS_WINDOW, and TOO_MANY_REQUESTS with their distinct codes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "RESOURCE_BUSY", message: "busy" } }, 409),
    );
    await expect(apiGet("/api/x")).rejects.toMatchObject({ code: "RESOURCE_BUSY" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "OUTSIDE_ACCESS_WINDOW", message: "closed" } }, 403),
    );
    await expect(apiGet("/api/y")).rejects.toMatchObject({ code: "OUTSIDE_ACCESS_WINDOW" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "TOO_MANY_REQUESTS", message: "slow down", retryAfterSeconds: 42 } },
        429,
      ),
    );
    await expect(apiGet("/api/z")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryAfterSeconds: 42,
    });
  });
});
