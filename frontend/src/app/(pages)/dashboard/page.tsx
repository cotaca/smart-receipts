"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";

import { SpendChart } from "@/components/dashboard/spend-chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { getDashboard, type Dashboard, type DashboardPeriod } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { formatAmount, formatDate, formatDateOnly } from "@/lib/utils";

const mono = (chunks: ReactNode) => (
  <span className="font-mono text-foreground">{chunks}</span>
);

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-[10px] font-medium tracking-wider uppercase">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-medium tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function monthLabel(month: string, numberFormat: string) {
  return new Intl.DateTimeFormat(numberFormat, {
    month: "short",
    year: "numeric",
  }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
  );
}

function DashboardContent({
  data,
  today,
  periodLabel,
  numberFormat: nf,
}: {
  data: Dashboard;
  today: string;
  periodLabel: string | undefined;
  numberFormat: string;
}) {
  const t = useTranslations("DashboardPage");
  const amount = (value: string) =>
    `${formatAmount(value, nf)} ${data.currency}`;
  const lastMonth = Number(data.last_month);
  const change =
    // amount can be negative (refund), so last month may be <= 0.
    lastMonth <= 0
      ? null
      : new Intl.NumberFormat(nf, {
          style: "percent",
          signDisplay: "exceptZero",
          maximumFractionDigits: 1,
        }).format((Number(data.this_month) - lastMonth) / lastMonth);
  const first = data.monthly[0]?.month;
  const last = data.monthly[data.monthly.length - 1]?.month;
  const maxMerchant = Math.max(
    ...data.top_merchants.map((m) => Number(m.total)),
  );

  return (
    <>
      {data.excluded_count > 0 && (
        <Alert>
          <AlertDescription>
            {t("excludedHint", {
              count: data.excluded_count,
              currency: data.currency,
            })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Kpi
          label={t("kpiSpent")}
          value={<span className="font-mono">{amount(data.this_month)}</span>}
        >
          {change !== null && t.rich("changeVsLast", { change, mono })}
        </Kpi>
        <Kpi
          label={t("kpiAverage")}
          value={
            <span className="font-mono">
              {data.this_month_average === null
                ? "—"
                : amount(data.this_month_average)}
            </span>
          }
        >
          {t.rich("acrossReceipts", { count: data.this_month_count, mono })}
        </Kpi>
        <Kpi label={t("kpiBusiest")} value={data.busiest_merchant?.name ?? "—"}>
          {data.busiest_merchant &&
            t.rich("busiestDetail", {
              count: data.busiest_merchant.count,
              amount: amount(data.busiest_merchant.total),
              mono,
            })}
        </Kpi>
      </div>

      <SpendChart
        monthly={data.monthly}
        currentMonth={`${today.slice(0, 7)}-01`}
        currency={data.currency}
        numberFormat={nf}
        subtitle={
          first && last
            ? `${monthLabel(first, nf)} – ${monthLabel(last, nf)}`
            : ""
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("topMerchants")}</CardTitle>
            <CardAction className="text-xs text-muted-foreground">
              {periodLabel}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.top_merchants.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noData")}</p>
            )}
            {data.top_merchants.map((m) => (
              <div key={m.name} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="truncate">{m.name}</span>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {m.count}×
                  </span>
                  <span className="min-w-16 text-right font-mono font-medium">
                    {formatAmount(m.total, nf)}
                  </span>
                </div>
                <Progress
                  value={
                    maxMerchant > 0 ? (Number(m.total) / maxMerchant) * 100 : 0
                  }
                  aria-hidden
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("topProducts")}</CardTitle>
            <CardAction className="text-xs text-muted-foreground">
              {periodLabel}
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.top_products.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noData")}</p>
            ) : (
              <Table>
                <TableBody>
                  {data.top_products.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="max-w-0 truncate">
                        {p.name}
                      </TableCell>
                      <TableCell className="w-px text-right font-mono whitespace-nowrap text-muted-foreground">
                        {p.count}×
                      </TableCell>
                      <TableCell className="w-px text-right font-mono whitespace-nowrap">
                        {formatAmount(p.total, nf)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("recentTitle")}</CardTitle>
          <CardAction>
            <Link
              href="/receipts"
              className="text-xs font-medium text-foreground"
            >
              {t("viewAll")}
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col">
          {data.recent.map((r) => (
            <Link
              key={r.id}
              href={`/receipts?receipt=${r.id}`}
              className="flex items-center gap-3 border-t border-border py-2 text-xs first:border-t-0 hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.merchant}
              </span>
              <span className="font-mono text-muted-foreground">
                {formatDate(r.purchased_at, nf)}
              </span>
              <span className="min-w-20 text-right font-mono font-medium">
                {formatAmount(r.amount, nf)} {r.currency}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

export default function DashboardPage() {
  const t = useTranslations("DashboardPage");
  const { me } = useMe();
  const [period, setPeriod] = useState<DashboardPeriod>("last-12-months");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Taken once: the client's local date is the dashboard's "today".
  const [today] = useState(() => formatDateOnly(new Date()));

  // `items` as well as the SelectItems, or the trigger shows the raw value.
  const periodOptions: { value: DashboardPeriod; label: string }[] = [
    { value: "last-12-months", label: t("periodLast12Months") },
    { value: "this-year", label: t("periodThisYear") },
    { value: "last-year", label: t("periodLastYear") },
  ];

  useEffect(() => {
    let cancelled = false;
    getDashboard(today, period)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [today, period]);

  let body: ReactNode;
  if (loadError) {
    body = (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t("loadError")}</AlertDescription>
      </Alert>
    );
  } else if (data === null) {
    body = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (data.recent.length === 0 && data.excluded_count === 0) {
    body = (
      <Empty className="flex-1 border border-dashed border-border bg-muted">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={DashboardSquare01Icon} />
          </EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/receipts?upload=1"
            className={buttonVariants({ size: "lg" })}
          >
            <HugeiconsIcon icon={Upload04Icon} />
            {t("uploadReceipt")}
          </Link>
        </EmptyContent>
      </Empty>
    );
  } else {
    body = (
      <DashboardContent
        data={data}
        today={today}
        numberFormat={me.number_format}
        periodLabel={periodOptions.find((o) => o.value === period)?.label}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-7 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <Select
          items={periodOptions}
          value={period}
          onValueChange={(v) => setPeriod((v as DashboardPeriod) ?? period)}
        >
          <SelectTrigger size="sm" aria-label={t("periodAriaLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-auto min-w-(--anchor-width)">
            {periodOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {body}
    </div>
  );
}
