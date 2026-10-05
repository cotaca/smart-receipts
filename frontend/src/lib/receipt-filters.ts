import { isPdf } from "@/components/receipts/receipt-image";
import type { ReceiptPublic } from "@/lib/api";
import { formatDateOnly, parseDateOnly } from "@/lib/utils";

export type Period =
  "all" | "this-month" | "last-3-months" | "this-year" | "custom";
export type FileType = "all" | "image" | "pdf";
export type SortOrder = "newest" | "oldest" | "amount-desc" | "amount-asc";

export type Filters = {
  q: string;
  period: Period;
  from?: string; // "YYYY-MM-DD", only with period "custom"
  to?: string;
  min?: string; // dot-decimal, in the account's default currency
  max?: string;
  type: FileType;
  sort: SortOrder;
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  period: "all",
  type: "all",
  sort: "newest",
};

const PERIODS: Period[] = [
  "all",
  "this-month",
  "last-3-months",
  "this-year",
  "custom",
];
const TYPES: FileType[] = ["all", "image", "pdf"];
const SORTS: SortOrder[] = ["newest", "oldest", "amount-desc", "amount-asc"];
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

function pick<T extends string>(
  value: string | null,
  allowed: T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function validDate(value: string | null): string | undefined {
  // Round-trip rejects dates the Date constructor rolls over (2026-02-31).
  const date = value ? parseDateOnly(value) : null;
  return value && date && formatDateOnly(date) === value ? value : undefined;
}

function validAmount(value: string | null): string | undefined {
  return value && AMOUNT_RE.test(value) ? value : undefined;
}

// Invalid values fall back to the default instead of throwing: the URL is
// user-editable input.
export function parseFilters(params: URLSearchParams): Filters {
  const from = validDate(params.get("from"));
  const to = validDate(params.get("to"));
  let period = pick(params.get("period"), PERIODS, DEFAULT_FILTERS.period);
  if (period === "custom" && !from && !to) period = "all";
  return {
    q: params.get("q") ?? "",
    period,
    ...(period === "custom" ? { from, to } : {}),
    min: validAmount(params.get("min")),
    max: validAmount(params.get("max")),
    type: pick(params.get("type"), TYPES, DEFAULT_FILTERS.type),
    sort: pick(params.get("sort"), SORTS, DEFAULT_FILTERS.sort),
  };
}

// Writes the filters into `params` (mutating it): defaults are omitted, other
// params (`receipt`) are left alone.
export function filtersToParams(f: Filters, params: URLSearchParams) {
  const set = (key: string, value: string | undefined, def = "") => {
    if (value && value !== def) params.set(key, value);
    else params.delete(key);
  };
  set("q", f.q.trim());
  // A custom period with neither date is inactive, so it isn't written.
  const range = f.period === "custom" && (f.from || f.to);
  set(
    "period",
    f.period === "custom" && !range ? undefined : f.period,
    DEFAULT_FILTERS.period,
  );
  set("from", range ? f.from : undefined);
  set("to", range ? f.to : undefined);
  set("min", f.min);
  set("max", f.max);
  set("type", f.type, DEFAULT_FILTERS.type);
  set("sort", f.sort, DEFAULT_FILTERS.sort);
}

function matchesPeriod(purchasedAt: string, f: Filters, today: Date): boolean {
  if (f.period === "all") return true;
  const date = parseDateOnly(purchasedAt);
  if (!date) return false;

  switch (f.period) {
    case "this-month":
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth()
      );
    case "this-year":
      return date.getFullYear() === today.getFullYear();
    case "last-3-months":
      // this month plus the two before it
      return date >= new Date(today.getFullYear(), today.getMonth() - 2, 1);
    default: {
      const from = f.from ? parseDateOnly(f.from) : null;
      const to = f.to ? parseDateOnly(f.to) : null;
      return (!from || date >= from) && (!to || date <= to);
    }
  }
}

export function amountFilterActive(f: Filters) {
  return f.min !== undefined || f.max !== undefined;
}

// itemHit: the first matching line item, set only when the merchant itself
// doesn't match (so the row can say why it is listed).
export function matchReceipt(
  r: ReceiptPublic,
  f: Filters,
  defaultCurrency: string,
  today: Date,
): { match: boolean; itemHit?: string } {
  const no = { match: false };
  if (!matchesPeriod(r.purchased_at, f, today)) return no;
  if (f.type === "pdf" && !isPdf(r.content_type)) return no;
  if (f.type === "image" && isPdf(r.content_type)) return no;
  if (amountFilterActive(f)) {
    if (r.currency !== defaultCurrency) return no;
    const amount = Number(r.amount);
    if (f.min !== undefined && amount < Number(f.min)) return no;
    if (f.max !== undefined && amount > Number(f.max)) return no;
  }

  const needle = f.q.trim().toLowerCase();
  if (!needle) return { match: true };
  if (r.merchant.toLowerCase().includes(needle)) return { match: true };
  const item = r.items.find((i) =>
    i.description.toLowerCase().includes(needle),
  );
  if (item) return { match: true, itemHit: item.description };
  return { match: !!r.notes?.toLowerCase().includes(needle) };
}

export function sortReceipts(
  receipts: ReceiptPublic[],
  sort: SortOrder,
): ReceiptPublic[] {
  const sorted = [...receipts];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) =>
        a.purchased_at.localeCompare(b.purchased_at),
      );
    case "amount-desc":
      return sorted.sort((a, b) => Number(b.amount) - Number(a.amount));
    case "amount-asc":
      return sorted.sort((a, b) => Number(a.amount) - Number(b.amount));
    case "newest":
    default:
      return sorted.sort((a, b) =>
        b.purchased_at.localeCompare(a.purchased_at),
      );
  }
}

// Cent-integer sum as a dot-decimal string; null for mixed currencies (no
// wrong sum) or an empty list.
export function sumAmounts(receipts: ReceiptPublic[]): string | null {
  if (receipts.length === 0) return null;
  const currency = receipts[0].currency;
  if (receipts.some((r) => r.currency !== currency)) return null;
  const cents = receipts.reduce(
    (sum, r) => sum + Math.round(Number(r.amount) * 100),
    0,
  );
  return (cents / 100).toFixed(2);
}

// Expects date-sorted input: groups are runs of the same "YYYY-MM".
export function groupByMonth(receipts: ReceiptPublic[]) {
  const groups: {
    key: string;
    receipts: ReceiptPublic[];
    total: string | null;
  }[] = [];
  for (const r of receipts) {
    const key = r.purchased_at.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.receipts.push(r);
    else groups.push({ key, receipts: [r], total: null });
  }
  for (const g of groups) g.total = sumAmounts(g.receipts);
  return groups;
}

// "1.234,56" (de-DE) / "1,234.56" (en-US) -> "1234.56"; null if not a valid
// amount in that format. A lone group separator ("12.50" in de-DE) is
// rejected rather than read as 1250.
export function parseAmountInput(
  raw: string,
  numberFormat: string,
): string | null {
  const parts = new Intl.NumberFormat(numberFormat).formatToParts(1234567.5);
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const g = group.trim() === "" ? "[\\s\\u00a0\\u202f]" : esc(group);
  const re = new RegExp(
    `^(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${esc(decimal)}(\\d{1,2}))?$`,
  );
  const m = re.exec(raw.trim());
  if (!m) return null;
  const whole = m[1].replace(new RegExp(g, "g"), "");
  return m[2] ? `${whole}.${m[2]}` : whole;
}

export type Chip = {
  key: "q" | "period" | "amount" | "type";
  reset: Partial<Filters>;
};

export function activeChips(f: Filters): Chip[] {
  const chips: Chip[] = [];
  if (f.q.trim()) chips.push({ key: "q", reset: { q: "" } });
  if (f.period !== "all" && (f.period !== "custom" || f.from || f.to))
    chips.push({
      key: "period",
      reset: { period: "all", from: undefined, to: undefined },
    });
  if (amountFilterActive(f))
    chips.push({ key: "amount", reset: { min: undefined, max: undefined } });
  if (f.type !== "all") chips.push({ key: "type", reset: { type: "all" } });
  return chips;
}
