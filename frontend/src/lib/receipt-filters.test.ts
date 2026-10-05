import { describe, expect, it } from "vitest";

import type { ReceiptPublic } from "@/lib/api";

import {
  activeChips,
  DEFAULT_FILTERS,
  filtersToParams,
  groupByMonth,
  matchReceipt,
  parseAmountInput,
  parseFilters,
  type Filters,
} from "./receipt-filters";

const TODAY = new Date(2026, 8, 19); // 2026-09-19

function receipt(overrides: Partial<ReceiptPublic>): ReceiptPublic {
  return {
    id: "r1",
    original_filename: "receipt.jpg",
    content_type: "image/jpeg",
    file_size: 123,
    merchant: "Trader Joe's",
    amount: "12.34",
    currency: "EUR",
    purchased_at: "2026-09-10",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    image_url: "/receipts/r1/image",
    items: [],
    ...overrides,
  };
}

function match(r: ReceiptPublic, f: Partial<Filters>) {
  return matchReceipt(r, { ...DEFAULT_FILTERS, ...f }, "EUR", TODAY);
}

describe("matchReceipt", () => {
  it("matches the merchant case-insensitively, without an item hit", () => {
    expect(match(receipt({}), { q: "TRADER" })).toEqual({ match: true });
  });

  it("matches a line item and reports the first hit", () => {
    const r = receipt({
      items: [
        {
          description: "Bananen",
          quantity: "1",
          unit_price: "1",
          total_price: "1",
        },
        {
          description: "Milch 1l",
          quantity: "1",
          unit_price: "1",
          total_price: "1",
        },
        {
          description: "Milchreis",
          quantity: "1",
          unit_price: "1",
          total_price: "1",
        },
      ],
    });
    expect(match(r, { q: "milch" })).toEqual({
      match: true,
      itemHit: "Milch 1l",
    });
  });

  it("matches notes and rejects everything else", () => {
    const r = receipt({ notes: "Geschenk für Anna" });
    expect(match(r, { q: "anna" }).match).toBe(true);
    expect(match(r, { q: "xyz" }).match).toBe(false);
  });

  it("filters by period", () => {
    const old = receipt({ purchased_at: "2025-12-31" });
    expect(match(old, { period: "this-year" }).match).toBe(false);
    expect(match(old, { period: "all" }).match).toBe(true);
    const july = receipt({ purchased_at: "2026-07-01" });
    expect(match(july, { period: "last-3-months" }).match).toBe(true);
    expect(match(july, { period: "this-month" }).match).toBe(false);
    const june = receipt({ purchased_at: "2026-06-30" });
    expect(match(june, { period: "last-3-months" }).match).toBe(false);
  });

  it("treats the custom range as inclusive on both ends", () => {
    const f = {
      period: "custom" as const,
      from: "2026-09-05",
      to: "2026-09-10",
    };
    expect(match(receipt({ purchased_at: "2026-09-05" }), f).match).toBe(true);
    expect(match(receipt({ purchased_at: "2026-09-10" }), f).match).toBe(true);
    expect(match(receipt({ purchased_at: "2026-09-04" }), f).match).toBe(false);
    expect(match(receipt({ purchased_at: "2026-09-11" }), f).match).toBe(false);
  });

  it("filters by file type", () => {
    const pdf = receipt({ content_type: "application/pdf" });
    expect(match(pdf, { type: "pdf" }).match).toBe(true);
    expect(match(pdf, { type: "image" }).match).toBe(false);
    expect(match(receipt({}), { type: "pdf" }).match).toBe(false);
    expect(match(receipt({}), { type: "image" }).match).toBe(true);
  });

  it("applies amount bounds and hides other currencies while active", () => {
    const f = { min: "10", max: "20" };
    expect(match(receipt({ amount: "10.00" }), f).match).toBe(true);
    expect(match(receipt({ amount: "20.00" }), f).match).toBe(true);
    expect(match(receipt({ amount: "9.99" }), f).match).toBe(false);
    expect(match(receipt({ amount: "20.01" }), f).match).toBe(false);
    expect(match(receipt({ currency: "USD", amount: "15" }), f).match).toBe(
      false,
    );
    expect(match(receipt({ currency: "USD", amount: "15" }), {}).match).toBe(
      true,
    );
  });
});

describe("groupByMonth", () => {
  it("groups by month and sums in cents", () => {
    const groups = groupByMonth([
      receipt({ id: "a", purchased_at: "2026-09-10", amount: "0.10" }),
      receipt({ id: "b", purchased_at: "2026-09-01", amount: "0.20" }),
      receipt({ id: "c", purchased_at: "2026-08-30", amount: "5.00" }),
    ]);
    expect(groups.map((g) => [g.key, g.total])).toEqual([
      ["2026-09", "0.30"],
      ["2026-08", "5.00"],
    ]);
  });

  it("has no total for a mixed-currency month", () => {
    const [g] = groupByMonth([
      receipt({ id: "a" }),
      receipt({ id: "b", currency: "USD" }),
    ]);
    expect(g.total).toBeNull();
  });
});

describe("filter URL params", () => {
  it("round-trips, omits defaults and keeps foreign params", () => {
    const f: Filters = {
      q: "milch",
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-10",
      min: "10.00",
      max: "50",
      type: "pdf",
      sort: "amount-desc",
    };
    const params = new URLSearchParams("receipt=abc");
    filtersToParams(f, params);
    expect(params.get("receipt")).toBe("abc");
    expect(parseFilters(params)).toEqual(f);

    filtersToParams(DEFAULT_FILTERS, params);
    expect(params.toString()).toBe("receipt=abc");
  });

  it("falls back to defaults for invalid values", () => {
    const f = parseFilters(
      new URLSearchParams(
        "period=bogus&type=x&sort=y&min=abc&max=1,5&from=2026-13-40&period=custom",
      ),
    );
    expect(f).toEqual({ ...DEFAULT_FILTERS, min: undefined, max: undefined });
  });
});

describe("parseAmountInput", () => {
  it("parses de-DE and en-US formats", () => {
    expect(parseAmountInput("1.234,56", "de-DE")).toBe("1234.56");
    expect(parseAmountInput("10,5", "de-DE")).toBe("10.5");
    expect(parseAmountInput("1,234.56", "en-US")).toBe("1234.56");
    expect(parseAmountInput("10", "en-US")).toBe("10");
  });

  it("rejects the other format and garbage", () => {
    expect(parseAmountInput("12.50", "de-DE")).toBeNull();
    expect(parseAmountInput("12,50", "en-US")).toBeNull();
    expect(parseAmountInput("abc", "en-US")).toBeNull();
    expect(parseAmountInput("1,2345", "en-US")).toBeNull();
    expect(parseAmountInput("", "en-US")).toBeNull();
  });
});

describe("activeChips", () => {
  it("lists only non-default filters", () => {
    expect(activeChips(DEFAULT_FILTERS)).toEqual([]);
    expect(
      activeChips({ ...DEFAULT_FILTERS, q: "x", min: "1", type: "pdf" }).map(
        (c) => c.key,
      ),
    ).toEqual(["q", "amount", "type"]);
  });
});

describe("parseFilters custom period", () => {
  it("falls back to all without a valid date", () => {
    for (const qs of [
      "period=custom",
      "period=custom&from=2026-13-40",
      "period=custom&from=2026-02-31",
    ]) {
      const f = parseFilters(new URLSearchParams(qs));
      expect(f.period).toBe("all");
      expect(f.from).toBeUndefined();
    }
  });

  it("keeps a half-open range", () => {
    const f = parseFilters(
      new URLSearchParams("period=custom&from=2026-09-01"),
    );
    expect(f.period).toBe("custom");
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBeUndefined();
  });

  it("treats an empty custom range as inactive", () => {
    const f = { ...DEFAULT_FILTERS, period: "custom" as const };
    expect(activeChips(f)).toEqual([]);
    const params = new URLSearchParams();
    filtersToParams(f, params);
    expect(params.toString()).toBe("");
  });
});
