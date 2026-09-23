"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { de, enUS } from "date-fns/locale";
import type { MonthCaptionProps } from "react-day-picker";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";

import { cn, formatDate, formatDateOnly, parseDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// react-day-picker has no month/year view -- only its month caption is
// overridden below, the grids are a plain view swap on top of the same
// Popover content, sized to match the day calendar so it doesn't jump.
type View = "day" | "month" | "year";
const YEARS_PER_PAGE = 12;

type DatePickerProps = {
  id?: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  numberFormat: string;
  placeholder: string;
  className?: string;
};

export function DatePicker({
  id,
  value,
  onChange,
  numberFormat,
  placeholder,
  className,
}: DatePickerProps) {
  const t = useTranslations("DatePicker");
  const locale = useLocale() === "de" ? de : enUS;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("day");
  const [month, setMonth] = useState(() => parseDateOnly(value) ?? today);
  const [yearPageStart, setYearPageStart] = useState(() => yearPageOf(month));

  function yearPageOf(d: Date) {
    return Math.floor(d.getFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    // Always reopen on the day view, in the month of the current value (or
    // today) -- also covers a value set by OCR while the popover was closed.
    const start = parseDateOnly(value) ?? today;
    setView("day");
    setMonth(start);
    setYearPageStart(yearPageOf(start));
  }

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale.code, { month: "short" }).format(
      new Date(2000, i, 1),
    ),
  );

  const chooseMonthLabel = t("chooseMonth");
  // Memoized so DayPicker gets a stable caption component: an inline one
  // would remount on every month change and its live region would never
  // announce the new month.
  const calendarComponents = useMemo(
    () => ({
      MonthCaption: (props: MonthCaptionProps) => (
        <MonthCaptionButton
          {...props}
          locale={locale.code}
          label={chooseMonthLabel}
          onClick={() => setView("month")}
        />
      ),
    }),
    [locale.code, chooseMonthLabel],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("justify-start font-normal", className)}
          />
        }
      >
        <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
        <span className={value ? undefined : "text-muted-foreground"}>
          {value ? formatDate(value, numberFormat) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        {view === "day" && (
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={parseDateOnly(value) ?? undefined}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatDateOnly(date));
              setOpen(false);
            }}
            disabled={{ after: today }}
            endMonth={today}
            locale={locale}
            classNames={{ root: "w-full" }}
            components={calendarComponents}
          />
        )}

        {view === "month" && (
          <div className="flex flex-col gap-2 p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center gap-1 font-medium"
              title={t("chooseYear")}
              onClick={() => setView("year")}
            >
              {month.getFullYear()}
              <span className="sr-only">, {t("chooseYear")}</span>
            </Button>
            <div className="grid grid-cols-3 gap-1">
              {monthNames.map((name, i) => {
                const disabled =
                  month.getFullYear() > today.getFullYear() ||
                  (month.getFullYear() === today.getFullYear() &&
                    i > today.getMonth());
                const selected = i === month.getMonth();
                return (
                  <Button
                    key={name}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => {
                      setMonth(new Date(month.getFullYear(), i, 1));
                      setView("day");
                    }}
                  >
                    {name}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {view === "year" && (
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("previousYears")}
                onClick={() => setYearPageStart((s) => s - YEARS_PER_PAGE)}
              >
                <HugeiconsIcon icon={ArrowLeftIcon} />
              </Button>
              <span className="font-medium">
                {yearPageStart}–{yearPageStart + YEARS_PER_PAGE - 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("nextYears")}
                disabled={yearPageStart + YEARS_PER_PAGE > today.getFullYear()}
                onClick={() => setYearPageStart((s) => s + YEARS_PER_PAGE)}
              >
                <HugeiconsIcon icon={ArrowRightIcon} />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
                const year = yearPageStart + i;
                const selected = year === month.getFullYear();
                return (
                  <Button
                    key={year}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    disabled={year > today.getFullYear()}
                    aria-pressed={selected}
                    onClick={() => {
                      const clampedMonth =
                        year === today.getFullYear()
                          ? Math.min(month.getMonth(), today.getMonth())
                          : month.getMonth();
                      setMonth(new Date(year, clampedMonth, 1));
                      setView("month");
                    }}
                  >
                    {year}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MonthCaptionButton({
  calendarMonth,
  // Consumed here so it isn't spread onto the <div> (React warns on
  // unknown DOM props).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  displayIndex,
  locale,
  label,
  onClick,
  ...props
}: MonthCaptionProps & { locale: string; label: string; onClick: () => void }) {
  const text = calendarMonth.date.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  return (
    <div {...props}>
      {/* Live region sits beside the button, not inside it: a button's
          children are presentational, so screen readers may skip changes. */}
      <span className="sr-only" role="status" aria-live="polite">
        {text}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // relative z-10: calendar.tsx lays its nav out as an absolute, full-width
        // bar over the caption row -- without this it swallows the click.
        className="relative z-10 gap-1 text-sm font-medium"
        title={label}
        onClick={onClick}
      >
        {text}
        <span className="sr-only">, {label}</span>
        <HugeiconsIcon icon={ArrowDownIcon} className="size-3.5" />
      </Button>
    </div>
  );
}
