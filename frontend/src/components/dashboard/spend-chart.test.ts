import { describe, expect, it } from "vitest";

import { toQuarters } from "./spend-chart";

describe("toQuarters", () => {
  it("sums months into calendar quarters, partial edge quarters included", () => {
    const monthly = [
      { month: "2025-11-01", total: "10.00" },
      { month: "2025-12-01", total: "5.50" },
      { month: "2026-01-01", total: "1.00" },
      { month: "2026-02-01", total: "2.00" },
      { month: "2026-03-01", total: "3.00" },
      { month: "2026-04-01", total: "4.00" },
    ];

    expect(toQuarters(monthly)).toEqual([
      { key: "2025-Q4", label: "Q4 2025", total: 15.5 },
      { key: "2026-Q1", label: "Q1 2026", total: 6 },
      { key: "2026-Q2", label: "Q2 2026", total: 4 },
    ]);
  });

  it("returns nothing for no months", () => {
    expect(toQuarters([])).toEqual([]);
  });
});
