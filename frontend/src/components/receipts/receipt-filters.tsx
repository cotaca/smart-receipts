"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { de, enUS } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/lib/me-context";
import {
  activeChips,
  amountFilterActive,
  DEFAULT_FILTERS,
  parseAmountInput,
  type FileType,
  type Filters,
  type Period,
  type SortOrder,
} from "@/lib/receipt-filters";
import {
  cn,
  formatAmount,
  formatDate,
  formatDateOnly,
  parseDateOnly,
} from "@/lib/utils";

// Under sm the sheet's tabs are 44 px tap targets: the list loses its padding
// and the triggers fill its height (tabs.tsx sizes them to calc(100% - 1px)).
const SHEET_TABS_LIST = "w-full max-sm:h-11 max-sm:p-0";
const SHEET_TAB = "max-sm:h-full";

// Inline grid whose cell holds every possible label (invisible) plus the
// current one: the width is the longest label of the current language, never
// the selection's. Don't replace with a magic width.
function StableLabel({
  labels,
  children,
}: {
  labels: string[];
  children: React.ReactNode;
}) {
  return (
    <span className="inline-grid">
      {labels.map((label) => (
        <span
          key={label}
          aria-hidden
          className="invisible col-start-1 row-start-1"
        >
          {label}
        </span>
      ))}
      <span className="col-start-1 row-start-1 flex items-center gap-1.5 text-left">
        {children}
      </span>
    </span>
  );
}

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  resultCount: number;
  // Pre-formatted ("12,34 EUR"); null when the results mix currencies.
  resultSum: string | null;
  // null until the receipts have loaded.
  totalCount: number | null;
  // Result count for a draft, so the sheet's "Show n receipts" is accurate
  // before the draft is applied.
  countFor: (filters: Filters) => number;
};

// Min/Max text -> filters; null while either text is not a valid amount.
function withAmounts(
  base: Filters,
  minText: string,
  maxText: string,
  numberFormat: string,
): Filters | null {
  const parse = (text: string) =>
    text.trim() === "" ? undefined : parseAmountInput(text, numberFormat);
  const min = parse(minText);
  const max = parse(maxText);
  if (min === null || max === null) return null;
  return { ...base, min, max };
}

export function ReceiptFilters({
  filters,
  onChange,
  resultCount,
  resultSum,
  totalCount,
  countFor,
}: Props) {
  const t = useTranslations("ReceiptFilters");
  const { me } = useMe();
  const locale = useLocale() === "de" ? de : enUS;
  const nf = me.number_format;
  const currency = me.default_currency;

  // Passed to Select as `items` as well as mapped into the SelectItems:
  // without `items`, Base UI's SelectValue renders the raw value
  // ("this-month") in the trigger instead of the label.
  const periodOptions: { value: Period; label: string }[] = [
    { value: "all", label: t("periodAll") },
    { value: "this-month", label: t("periodThisMonth") },
    { value: "last-3-months", label: t("periodLast3Months") },
    { value: "this-year", label: t("periodThisYear") },
    { value: "custom", label: t("periodCustom") },
  ];
  const typeOptions: { value: FileType; label: string }[] = [
    { value: "all", label: t("typeAll") },
    { value: "image", label: t("typeImage") },
    { value: "pdf", label: t("typePdf") },
  ];
  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "amount-desc", label: t("sortAmountDesc") },
    { value: "amount-asc", label: t("sortAmountAsc") },
  ];

  const popoverId = useId();
  const sheetId = useId();
  const [rangeOpen, setRangeOpen] = useState(false);
  // Half-picked calendar range: kept out of the filters until the second
  // click, so the list doesn't filter (or the URL change) mid-pick.
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const [amountOpen, setAmountOpen] = useState(false);
  const [amountText, setAmountText] = useState({ min: "", max: "" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const [draftText, setDraftText] = useState({ min: "", max: "" });

  const chips = activeChips(filters);
  const filterCount = chips.filter((c) => c.key !== "q").length;

  const fmt = (v: string) => formatAmount(v, nf);
  const textOf = (v?: string) => (v === undefined ? "" : fmt(v));

  function amountLabel(f: Filters) {
    if (f.min !== undefined && f.max !== undefined)
      return t("amountBetween", { min: fmt(f.min), max: fmt(f.max), currency });
    if (f.min !== undefined)
      return t("amountFrom", { amount: fmt(f.min), currency });
    if (f.max !== undefined)
      return t("amountUpTo", { amount: fmt(f.max), currency });
    return t("amount");
  }

  function periodLabel(f: Filters) {
    if (f.period !== "custom")
      return periodOptions.find((o) => o.value === f.period)?.label ?? "";
    if (f.from && f.to)
      return `${formatDate(f.from, nf)} – ${formatDate(f.to, nf)}`;
    if (f.from) return t("rangeFrom", { date: formatDate(f.from, nf) });
    if (f.to) return t("rangeUntil", { date: formatDate(f.to, nf) });
    return t("periodCustom");
  }

  const periodTriggerLabel =
    periodOptions.find(
      (o) =>
        o.value ===
        (filters.period === "custom" && !filters.from && !filters.to
          ? "all"
          : filters.period),
    )?.label ?? "";

  function chipLabel(key: "q" | "period" | "amount" | "type") {
    switch (key) {
      case "q":
        return t("chipSearch", { q: filters.q.trim() });
      case "period":
        return periodLabel(filters);
      case "amount":
        return amountLabel(filters);
      case "type":
        return typeOptions.find((o) => o.value === filters.type)?.label ?? "";
    }
  }

  function openAmount(open: boolean) {
    setAmountOpen(open);
    if (open)
      setAmountText({ min: textOf(filters.min), max: textOf(filters.max) });
  }

  function openSheet(open: boolean) {
    setSheetOpen(open);
    if (open) {
      setDraft(filters);
      setDraftText({ min: textOf(filters.min), max: textOf(filters.max) });
    }
  }

  const amountApplied = withAmounts(
    filters,
    amountText.min,
    amountText.max,
    nf,
  );
  const draftApplied = withAmounts(draft, draftText.min, draftText.max, nf);
  const isInvalid = (text: string) =>
    text.trim() !== "" && parseAmountInput(text, nf) === null;

  const range: DateRange | undefined =
    filters.from || filters.to
      ? {
          from: filters.from
            ? (parseDateOnly(filters.from) ?? undefined)
            : undefined,
          to: filters.to ? (parseDateOnly(filters.to) ?? undefined) : undefined,
        }
      : undefined;
  const today = new Date();

  function amountFields(
    id: string,
    text: { min: string; max: string },
    set: (text: { min: string; max: string }) => void,
  ) {
    const invalid = isInvalid(text.min) || isInvalid(text.max);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          {(["min", "max"] as const).map((key) => (
            <div key={key} className="flex min-w-0 flex-1 flex-col gap-1">
              <label
                htmlFor={`${id}-${key}`}
                className="text-xs text-muted-foreground"
              >
                {t(key === "min" ? "amountMin" : "amountMax")}
              </label>
              <InputGroup size="touch">
                <InputGroupInput
                  id={`${id}-${key}`}
                  inputMode="decimal"
                  className="font-mono"
                  value={text[key]}
                  aria-invalid={isInvalid(text[key]) || undefined}
                  aria-describedby={`${id}-error`}
                  onChange={(e) => set({ ...text, [key]: e.target.value })}
                />
                <InputGroupAddon align="inline-end" className="font-mono">
                  {currency}
                </InputGroupAddon>
              </InputGroup>
            </div>
          ))}
        </div>
        {/* One slot for hint and error, so the error never changes the height. */}
        <p
          id={`${id}-error`}
          aria-live="polite"
          className={cn(
            "min-h-[2lh] text-xs",
            invalid ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {invalid ? t("amountInvalid") : t("amountHint", { currency })}
        </p>
      </div>
    );
  }

  function selectControl<V extends string>(
    options: { value: V; label: string }[],
    value: V,
    onValueChange: (value: V) => void,
    ariaLabel: string,
    className?: string,
    inSheet?: boolean,
  ) {
    return (
      <Select
        items={options}
        value={value}
        onValueChange={(v) => onValueChange((v as V) ?? options[0].value)}
      >
        {/* aria-label: the trigger's visible text is the selected value, so
            without this the control has no name of its own telling you what
            it filters — don't remove as "redundant". */}
        <SelectTrigger
          className={cn(inSheet && "data-[size=default]:h-11", className)}
          aria-label={ariaLabel}
        >
          {inSheet ? (
            <SelectValue />
          ) : (
            // The trigger's `*:data-[slot=select-value]` styles (line-clamp)
            // don't reach this nested SelectValue; the trigger's nowrap is
            // inherited, which is all that's needed.
            <StableLabel labels={options.map((o) => o.label)}>
              <SelectValue />
            </StableLabel>
          )}
        </SelectTrigger>
        {/* SelectContent defaults to the trigger's width: keep that as the
            floor, let the popup grow so longer options aren't clipped. */}
        <SelectContent
          className="w-auto min-w-(--anchor-width)"
          // The sheet hugs the bottom edge: open upward, not item-aligned,
          // so the popup isn't clipped by the viewport.
          {...(inSheet && { side: "top", alignItemWithTrigger: false })}
        >
          {options.map(({ value: v, label }) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const presets = periodOptions.filter((o) => o.value !== "custom");

  return (
    <div className="flex flex-col gap-2">
      {/* Sizes depend on the breakpoint only, never on the content: under lg
          search + Filters button, lg-xl search above the controls, xl one row. */}
      <div className="grid gap-2 rounded-lg border border-border bg-muted p-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="flex gap-2">
          <InputGroup size="touch" className="min-w-0 flex-1">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={t("searchAriaLabel")}
              placeholder={t("searchPlaceholder")}
              value={filters.q}
              onChange={(e) => onChange({ ...filters, q: e.target.value })}
            />
          </InputGroup>

          <Button
            variant="outline"
            size="touch"
            className="lg:hidden"
            aria-label={t("filtersActive", { count: filterCount })}
            onClick={() => openSheet(true)}
          >
            <HugeiconsIcon icon={FilterHorizontalIcon} />
            {t("filters")}
            {/* Always rendered (invisible at 0) so the button keeps its width. */}
            <Badge
              className={cn("font-mono", filterCount === 0 && "invisible")}
              aria-hidden
            >
              {filterCount}
            </Badge>
          </Button>
        </div>

        <div className="flex gap-2 max-lg:hidden">
          <Popover
            open={rangeOpen}
            onOpenChange={(open) => {
              setRangeOpen(open);
              setDraftRange(undefined);
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  aria-label={t("periodTrigger", { value: periodTriggerLabel })}
                />
              }
            >
              <HugeiconsIcon icon={Calendar03Icon} />
              <StableLabel labels={periodOptions.map((o) => o.label)}>
                {filters.period === "custom" && (filters.from || filters.to)
                  ? t("periodCustom")
                  : periodTriggerLabel}
              </StableLabel>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto flex-row gap-0 p-0"
              align="start"
              aria-label={t("periodAriaLabel")}
            >
              <div className="flex flex-col gap-0.5 border-r border-border p-2">
                {presets.map(({ value, label }) => {
                  const active = filters.period === value;
                  return (
                    <Button
                      key={value}
                      variant="ghost"
                      className="justify-start"
                      aria-pressed={active}
                      onClick={() => {
                        onChange({
                          ...filters,
                          period: value,
                          from: undefined,
                          to: undefined,
                        });
                        setRangeOpen(false);
                      }}
                    >
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className={active ? undefined : "invisible"}
                        aria-hidden
                      />
                      {label}
                    </Button>
                  );
                })}
              </div>
              <Calendar
                mode="range"
                // The first click starts a new range even when one is
                // applied; a complete range (from === to allowed) applies
                // on the second click.
                resetOnSelect
                selected={draftRange ?? range}
                defaultMonth={range?.from ?? today}
                onSelect={(r) => {
                  if (r?.from && r.to) {
                    onChange({
                      ...filters,
                      period: "custom",
                      from: formatDateOnly(r.from),
                      to: formatDateOnly(r.to),
                    });
                    setDraftRange(undefined);
                    setRangeOpen(false);
                  } else if (r) {
                    setDraftRange(r);
                  } else {
                    // Clicking the applied single day again clears it.
                    onChange({
                      ...filters,
                      period: "all",
                      from: undefined,
                      to: undefined,
                    });
                    setRangeOpen(false);
                  }
                }}
                disabled={{ after: today }}
                endMonth={today}
                locale={locale}
              />
            </PopoverContent>
          </Popover>

          <Popover open={amountOpen} onOpenChange={openAmount}>
            <PopoverTrigger
              render={
                <Button
                  variant={
                    amountFilterActive(filters) ? "secondary" : "outline"
                  }
                  aria-label={
                    amountFilterActive(filters) ? t("amountActive") : undefined
                  }
                />
              }
            >
              {t("amount")}
              {/* Always rendered so the button keeps its width. */}
              <span
                className={cn(
                  "size-1.5 rounded-full bg-primary",
                  !amountFilterActive(filters) && "invisible",
                )}
                aria-hidden
              />
            </PopoverTrigger>
            <PopoverContent
              className="w-72"
              align="start"
              aria-label={t("amount")}
            >
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!amountApplied) return;
                  onChange(amountApplied);
                  setAmountOpen(false);
                }}
              >
                {amountFields(popoverId, amountText, setAmountText)}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onChange({ ...filters, min: undefined, max: undefined });
                      setAmountOpen(false);
                    }}
                  >
                    {t("reset")}
                  </Button>
                  <Button type="submit" size="sm" disabled={!amountApplied}>
                    {t("apply")}
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>

          {selectControl(
            typeOptions,
            filters.type,
            (type) => onChange({ ...filters, type }),
            t("typeAriaLabel"),
          )}
          {selectControl(
            sortOptions,
            filters.sort,
            (sort) => onChange({ ...filters, sort }),
            t("sortAriaLabel"),
            "ml-auto",
          )}
        </div>
      </div>

      {/* Always present and one line high, so the table below never shifts
          when the first filter is applied. The count doubles as the live
          region announcing every change. */}
      <div className="flex h-6 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none]">
          {chips.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {t("activeFilters")}
            </span>
          )}
          {chips.map(({ key, reset }) => {
            const label = chipLabel(key);
            return (
              <Button
                key={key}
                variant="secondary"
                size="xs"
                className={
                  key === "amount" ||
                  (key === "period" && filters.period === "custom")
                    ? "shrink-0 rounded-full font-mono"
                    : "shrink-0 rounded-full"
                }
                aria-label={t("removeFilter", { label })}
                title={label}
                onClick={() => onChange({ ...filters, ...reset })}
              >
                <span className="max-w-48 truncate">{label}</span>
                <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
              </Button>
            );
          })}
          {chips.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              onClick={() =>
                onChange({ ...DEFAULT_FILTERS, sort: filters.sort })
              }
            >
              {t("clearAll")}
            </Button>
          )}
        </div>
        <span
          aria-live="polite"
          className="shrink-0 text-xs text-muted-foreground"
        >
          {totalCount !== null &&
            totalCount > 0 &&
            (chips.length > 0 ? (
              <>
                {t("resultCount", { count: resultCount, total: totalCount })}
                {resultSum && (
                  <>
                    {" · "}
                    <span className="font-mono">{resultSum}</span>
                  </>
                )}
              </>
            ) : (
              t("resultTotal", { total: totalCount })
            ))}
        </span>
      </div>

      {/* The sheet works on a draft copy and applies it on "Show"; the
          desktop controls above apply immediately. */}
      <Sheet open={sheetOpen} onOpenChange={openSheet}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-xl"
        >
          <SheetHeader>
            <SheetTitle>{t("sheetTitle")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-6">
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                {t("sheetPeriodLabel")}
              </h3>
              <Tabs
                value={draft.period}
                onValueChange={(period) =>
                  setDraft({
                    ...draft,
                    period: period as Period,
                    from: undefined,
                    to: undefined,
                  })
                }
              >
                <TabsList className={SHEET_TABS_LIST}>
                  <TabsTrigger value="all" className={SHEET_TAB}>
                    {t("sheetPeriodAll")}
                  </TabsTrigger>
                  <TabsTrigger value="this-month" className={SHEET_TAB}>
                    {t("sheetPeriodMonth")}
                  </TabsTrigger>
                  <TabsTrigger value="last-3-months" className={SHEET_TAB}>
                    {t("sheetPeriod3Months")}
                  </TabsTrigger>
                  <TabsTrigger value="this-year" className={SHEET_TAB}>
                    {t("sheetPeriodYear")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                {t("sheetAmountLabel")}
              </h3>
              {amountFields(sheetId, draftText, setDraftText)}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                {t("sheetTypeLabel")}
              </h3>
              <Tabs
                value={draft.type}
                onValueChange={(type) =>
                  setDraft({ ...draft, type: type as FileType })
                }
              >
                <TabsList className={SHEET_TABS_LIST}>
                  {typeOptions.map(({ value, label }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className={SHEET_TAB}
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                {t("sheetSortLabel")}
              </h3>
              {selectControl(
                sortOptions,
                draft.sort,
                (sort) => setDraft({ ...draft, sort }),
                t("sortAriaLabel"),
                "w-full",
                true,
              )}
            </section>
          </div>
          <SheetFooter className="flex-row">
            <Button
              variant="outline"
              size="touch"
              className="flex-1"
              onClick={() => {
                setDraft({
                  ...DEFAULT_FILTERS,
                  q: filters.q,
                  sort: filters.sort,
                });
                setDraftText({ min: "", max: "" });
              }}
            >
              {t("reset")}
            </Button>
            <Button
              size="touch"
              className="flex-[2]"
              disabled={!draftApplied}
              onClick={() => {
                if (!draftApplied) return;
                onChange(draftApplied);
                setSheetOpen(false);
              }}
            >
              {t("showResults", {
                count:
                  sheetOpen && draftApplied
                    ? countFor(draftApplied)
                    : resultCount,
              })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
