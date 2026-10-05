import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import Home from "./page";

beforeEach(() => redirect.mockClear());

describe("/ redirect", () => {
  it("keeps the query", async () => {
    await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ receipt: "r1", q: "x" }),
    });
    expect(redirect).toHaveBeenCalledWith("/receipts?receipt=r1&q=x");
  });

  it("repeats array values and encodes", async () => {
    await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ q: ["a", "b"], x: "a b&c" }),
    });
    expect(redirect).toHaveBeenCalledWith("/receipts?q=a&q=b&x=a+b%26c");
  });

  it("works without a query", async () => {
    await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    expect(redirect).toHaveBeenCalledWith("/receipts");
  });
});
