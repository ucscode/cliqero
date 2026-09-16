"use client";

import { useEffect, useState } from "react";
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
import { Money } from "../money";
import { Toast } from "../toast";

export function DashboardOverview({
  profile,
}: {
  profile: { username: string; email: string } | null;
}) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [purchases, setPurchases] = useState<PurchasePage | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void Promise.all([
      apiFetch<WalletSummary>("/api/wallet"),
      apiFetch<PurchasePage>("/api/purchases?limit=3"),
      apiFetch<EarningsSummary>("/api/earnings"),
    ])
      .then(([walletSummary, purchasePage, earningsSummary]) => {
        setWallet(walletSummary);
        setPurchases(purchasePage);
        setEarnings(earningsSummary);
      })
      .catch(() => setError(true));
  }, []);
  return (
    <div className="grid gap-6">
      {error && <Toast>Some account summaries are temporarily unavailable.</Toast>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="eyebrow">Available wallet</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            {wallet ? <Money minor={wallet.available_minor} currency="USD" /> : "Unavailable"}
          </h2>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=wallet"
          >
            View wallet <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
          </Link>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Available earnings</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            <Money
              minor={
                earnings?.balances.find((balance) => balance.state === "available")?.amount_minor ??
                "0"
              }
              currency="USD"
            />
          </h2>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=earnings"
          >
            View earnings <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
          </Link>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Purchases</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            {purchases?.items.length ?? "—"}
          </h2>
          <p className="text-sm text-slate-500">Recent purchases in your collection.</p>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=purchases"
          >
            View purchases <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
          </Link>
        </Card>
      </div>
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">{siteConfig.name} dashboard</p>
          <h2>Keep exploring, {profile?.username ?? "there"}.</h2>
          <p>Your wallet and purchases are ready when you are.</p>
        </div>
        <Button asChild>
          <Link href="/catalogue">Explore catalogue</Link>
        </Button>
      </Card>
    </div>
  );
}
