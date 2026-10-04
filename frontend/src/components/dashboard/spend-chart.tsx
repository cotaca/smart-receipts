"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, Rectangle, XAxis, type BarShapeProps } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAmount } from "@/lib/utils";

type Month = { month: string; total: string };
type Quarter = { key: string; label: string; total: number };
type View = "monthly" | "quarterly";
type BarDatum = { key: string; label: string; total: number; current: boolean };

function quarterKey(month: string) {
  return `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
}

// Calendar quarters, so the first and last quarter of a 12-month range can be
// partial -- accepted, see .claude/rules/dashboard.md.
export function toQuarters(monthly: Month[]): Quarter[] {
  const quarters: Quarter[] = [];
  for (const { month, total } of monthly) {
    const key = quarterKey(month);
    const last = quarters[quarters.length - 1];
    if (last?.key === key) {
      last.total += Number(total);
    } else {
      quarters.push({
        key,
        label: `${key.slice(5)} ${key.slice(0, 4)}`,
        total: Number(total),
      });
    }
  }
  return quarters;
}

const config = { total: { color: "var(--chart-1)" } } satisfies ChartConfig;

export function SpendChart({
  monthly,
  currentMonth,
  currency,
  numberFormat,
  subtitle,
}: {
  monthly: Month[];
  // "YYYY-MM-01" of today's month: its bar gets the highlight colour.
  currentMonth: string;
  currency: string;
  numberFormat: string;
  subtitle: string;
}) {
  const t = useTranslations("DashboardPage");
  const [view, setView] = useState<View>("monthly");
  // Dates follow number_format, not the UI language (settings-i18n rule).
  const monthName = new Intl.DateTimeFormat(numberFormat, { month: "short" });
  const monthlyBars: BarDatum[] = monthly.map(({ month, total }) => ({
    key: month,
    label: monthName.format(
      new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
    ),
    total: Number(total),
    current: month === currentMonth,
  }));
  const currentQuarter = quarterKey(currentMonth);
  const quarterlyBars: BarDatum[] = toQuarters(monthly).map((q) => ({
    ...q,
    current: q.key === currentQuarter,
  }));

  const bars = view === "monthly" ? monthlyBars : quarterlyBars;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("spendTitle")}</CardTitle>
        <CardDescription>
          {subtitle} · <span className="font-mono">{currency}</span>
        </CardDescription>
        <CardAction>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="monthly">{t("tabMonthly")}</TabsTrigger>
              <TabsTrigger value="quarterly">{t("tabQuarterly")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          role="img"
          aria-label={`${t("spendTitle")}, ${subtitle}, ${currency}`}
          className="aspect-auto h-48 w-full"
        >
          <BarChart accessibilityLayer data={bars}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(value) => (
                    <span className="font-mono">
                      {formatAmount(String(value), numberFormat)} {currency}
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="total"
              shape={(props: BarShapeProps) => (
                <Rectangle
                  {...props}
                  radius={2}
                  fill={`var(${props.payload.current ? "--chart-2" : "--chart-1"})`}
                />
              )}
            />
          </BarChart>
        </ChartContainer>
        <ul className="sr-only">
          {bars.map((b) => (
            <li key={b.key}>
              {b.label}: {formatAmount(String(b.total), numberFormat)}{" "}
              {currency}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
