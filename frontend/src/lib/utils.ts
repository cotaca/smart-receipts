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
