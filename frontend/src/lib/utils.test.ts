import { describe, expect, it } from "vitest";

import {
  formatDateOnly,
  formatQuantity,
  parseDateOnly,
  trimQuantity,
} from "./utils";

describe("parseDateOnly / formatDateOnly", () => {
  it("round-trips a date string", () => {
    const date = parseDateOnly("2024-01-05");
    expect(date).not.toBeNull();
    expect(formatDateOnly(date as Date)).toBe("2024-01-05");
  });

  // Regression guard: `new Date("2024-01-05")` parses as UTC midnight, which
  // shifts to Jan 4th in any timezone west of UTC -- parseDateOnly must build
  // the Date from local getters instead.
  it("parses at local midnight, not UTC", () => {
    const date = parseDateOnly("2024-01-05") as Date;
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });

  it("returns null for an empty or malformed string", () => {
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("not-a-date")).toBeNull();
  });
});

describe("formatQuantity / trimQuantity", () => {
  it("drops decimals that carry no information", () => {
    expect(formatQuantity("1.000", "de-DE")).toBe("1");
    expect(formatQuantity("0.500", "de-DE")).toBe("0,5");
    expect(formatQuantity("1.250", "en-US")).toBe("1.25");
    expect(formatQuantity("0.125", "de-DE")).toBe("0,125");
    expect(trimQuantity("1.000")).toBe("1");
    expect(trimQuantity("0.500")).toBe("0.5");
    expect(trimQuantity("0.125")).toBe("0.125");
  });
});
