import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// amount is the backend's Decimal-as-string (e.g. "1248.55") -- Intl handles
// both the grouping and decimal separators per locale, no manual replace().
export function formatAmount(amount: string, numberFormat: string): string {
  return new Intl.NumberFormat(numberFormat, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

// purchased_at is a plain "YYYY-MM-DD" string with no time zone, so it must
// be parsed into a local-midnight Date -- `new Date(str)` treats it as UTC
// and shifts the day in any timezone west of UTC.
export function parseDateOnly(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string, numberFormat: string): string {
  const date = parseDateOnly(value);
  if (!date) return value;
  return date.toLocaleDateString(numberFormat, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
