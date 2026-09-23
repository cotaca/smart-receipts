import { describe, expect, it } from "vitest";

import { formatDateOnly, parseDateOnly } from "./utils";

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
