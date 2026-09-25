import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, login, setAccessToken } from "@/lib/api";

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string, init: RequestInit) =>
    Promise.resolve(handler(url, init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bearer(init: RequestInit) {
  return (init.headers as Record<string, string>).Authorization;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("apiFetch token refresh", () => {
  it("refreshes an expired access token once and retries the request", async () => {
    setAccessToken("expired");
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/auth/refresh")) {
        return json(200, { access_token: "fresh", token_type: "bearer" });
      }
      return bearer(init) === "Bearer fresh"
        ? json(200, { ok: true })
        : json(401);
    });

    await expect(apiFetch("/receipts")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one refresh between concurrent 401s", async () => {
    setAccessToken("expired");
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/auth/refresh")) {
        return json(200, { access_token: "fresh", token_type: "bearer" });
      }
      return bearer(init) === "Bearer fresh" ? json(200, []) : json(401);
    });

    await Promise.all([apiFetch("/receipts"), apiFetch("/receipts/1")]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      url.endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not refresh on a 401 from /auth/* (e.g. wrong password)", async () => {
    const fetchMock = stubFetch(() => json(401));

    await expect(login("a@b.c", "wrong")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the 401 when the refresh itself fails", async () => {
    setAccessToken("expired");
    const fetchMock = stubFetch(() => json(401));

    await expect(apiFetch("/receipts")).rejects.toBeInstanceOf(ApiError);
    // Original request + failed refresh, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
