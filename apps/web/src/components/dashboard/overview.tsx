"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  apiFetch,
  type EarningsSummary,
  type PurchasePage,
  type WalletSummary,
} from "@/lib/api-client";
import { siteConfig } from "@/config/site";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Money } from "../money";
import { findWithdrawableBalance } from "../earnings/withdrawable";

export type OverviewValue<T> =
  { status: "loading" } | { status: "success"; data: T } | { status: "error" };

export type DashboardOverviewData = {
  wallet: OverviewValue<WalletSummary>;
  earnings: OverviewValue<EarningsSummary>;
  purchases: OverviewValue<PurchasePage>;
};

export type DashboardOverviewReaders = {
  wallet: () => Promise<WalletSummary>;
  earnings: () => Promise<EarningsSummary>;
  purchases: () => Promise<PurchasePage>;
};

export function loadingDashboardOverview(): DashboardOverviewData {
  return {
    wallet: { status: "loading" },
    earnings: { status: "loading" },
    purchases: { status: "loading" },
  };
}

export async function loadDashboardOverview(
  readers: DashboardOverviewReaders,
): Promise<DashboardOverviewData> {
  const [wallet, earnings, purchases] = await Promise.allSettled([
    Promise.resolve().then(readers.wallet),
    Promise.resolve().then(readers.earnings),
    Promise.resolve().then(readers.purchases),
  ]);
  const settle = <T,>(result: PromiseSettledResult<T>): OverviewValue<T> =>
    result.status === "fulfilled" ? { status: "success", data: result.value } : { status: "error" };
  return { wallet: settle(wallet), earnings: settle(earnings), purchases: settle(purchases) };
}

const dashboardReaders: DashboardOverviewReaders = {
  wallet: () => apiFetch<WalletSummary>("/api/wallet"),
  purchases: () => apiFetch<PurchasePage>("/api/purchases?limit=3"),
  earnings: () => apiFetch<EarningsSummary>("/api/earnings"),
};

export function DashboardOverview({
  profile,
  readers = dashboardReaders,
}: {
  profile: { username: string; email: string } | null;
  readers?: DashboardOverviewReaders;
}) {
  const [data, setData] = useState(loadingDashboardOverview);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setData(loadingDashboardOverview());
    try {
      setData(await loadDashboardOverview(readers));
    } finally {
      inFlight.current = false;
    }
  }, [readers]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasError = Object.values(data).some((value) => value.status === "error");
  const refreshing = Object.values(data).some((value) => value.status === "loading");
  return (
    <div className="grid gap-6">
      {hasError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
        >
          <span>Some account summaries are temporarily unavailable.</span>
          <Button
            type="button"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? "Retrying…" : "Retry summaries"}
          </Button>
        </div>
      )}
      <DashboardOverviewCards data={data} />
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">{siteConfig.name} dashboard</p>
          <h2 className="my-2 text-xl font-semibold tracking-tight">
            Keep exploring, {profile?.username ?? "there"}.
          </h2>
          <p>Your wallet and purchases are ready when you are.</p>
        </div>
        <Button asChild>
          <Link href="/catalogue">Explore catalogue</Link>
        </Button>
      </Card>
    </div>
  );
}

export function DashboardOverviewCards({ data }: { data: DashboardOverviewData }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="p-5">
        <p className="eyebrow">Available wallet</p>
        <h2 className="my-2 text-3xl font-semibold tracking-tight">
          {data.wallet.status === "loading" ? (
            <Skeleton className="my-1 h-9 w-36" aria-label="Loading wallet balance" />
          ) : data.wallet.status === "error" ? (
            "Unavailable"
          ) : (
            <Money minor={data.wallet.data.available_minor} currency="USD" />
          )}
        </h2>
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href="/dashboard?section=wallet"
        >
          View wallet <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
        </Link>
      </Card>
      <Card className="p-5">
        <OverviewEarningsCard earnings={data.earnings} />
      </Card>
      <Card className="p-5">
        <OverviewPurchasesCard purchases={data.purchases} />
      </Card>
    </div>
  );
}

export function OverviewPurchasesCard({ purchases }: { purchases: OverviewValue<PurchasePage> }) {
  const latest = purchases.status === "success" ? purchases.data.items[0] : undefined;
  return (
    <>
      <p className="eyebrow">Purchases</p>
      <h2 className="my-2 text-2xl font-semibold tracking-tight">Your collection</h2>
      {purchases.status === "loading" ? (
        <Skeleton className="my-1 h-5 w-48" aria-label="Loading recent purchases" />
      ) : latest ? (
        <p className="text-sm text-slate-600">
          Latest: <span className="font-medium">{latest.title}</span> ·{" "}
          {new Date(latest.created_at).toLocaleDateString()}
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          {purchases.status === "success"
            ? "No purchases yet."
            : "Recent purchases are unavailable."}
        </p>
      )}
      <Link
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
        href="/dashboard?section=purchases"
      >
        View purchases <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
      </Link>
    </>
  );
}

export function OverviewEarningsCard({ earnings }: { earnings: OverviewValue<EarningsSummary> }) {
  const withdrawable =
    earnings.status === "success" ? findWithdrawableBalance(earnings.data) : null;

  return (
    <>
      <p className="eyebrow">Available earnings</p>
      <h2 className="my-2 text-3xl font-semibold tracking-tight">
        {earnings.status === "loading" ? (
          <Skeleton className="my-1 h-9 w-36" aria-label="Loading available earnings" />
        ) : earnings.status === "error" ||
          !earnings.data.withdrawal_currency ||
          !Array.isArray(earnings.data.withdrawable_balances) ? (
          "Unavailable"
        ) : withdrawable ? (
          <Money minor={withdrawable.amount_minor} currency={withdrawable.currency} />
        ) : (
          "No available earnings"
        )}
      </h2>
      <Link
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
        href="/dashboard?section=earnings"
      >
        View earnings <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
      </Link>
    </>
  );
}
