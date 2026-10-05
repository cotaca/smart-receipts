import { cn } from "@/lib/utils";

// Logo direction A, 24-unit drawing, from docs/ui-concept/screens/Logo-Mark.html.
// Decorative: every use sits next to the "SmartReceipts" wordmark.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("fill-primary", className)}
    >
      <path
        fillRule="evenodd"
        d="M7 2H17A2 2 0 0 1 19 4V19L17.25 22L15.5 19L13.75 22L12 19L10.25 22L8.5 19L6.75 22L5 19V4A2 2 0 0 1 7 2ZM8 6H16V8H8ZM8 10H13V12H8ZM8 14H16V16H8Z"
      />
    </svg>
  );
}
