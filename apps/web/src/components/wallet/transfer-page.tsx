"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type EarningsSummary,
  type WalletSummary,
} from "@/lib/api-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { WalletTransferForm } from "./transfers";

type AvailableBalances = { funding: string; earnings: string };

export function BalanceTransferPanel() {
  const [balances, setBalances] = useState<AvailableBalances | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wallet, earnings] = await Promise.all([
        apiFetch<WalletSummary>("/api/wallet"),
        apiFetch<EarningsSummary>("/api/earnings"),
      ]);
      const earningsAvailable = earnings.withdrawable_balances.find(
        (balance) => balance.currency === "USD",
      );
      if (!earningsAvailable) throw new Error("The available Earnings balance is unavailable.");
      setBalances({ funding: wallet.available_minor, earnings: earningsAvailable.amount_minor });
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Swap balances could not be loaded.",
      );
      setBalances(null);
    }
  }, []);

  useEffect(() => {
    // Initial loading synchronizes this panel with the wallet and Earnings APIs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="grid max-w-3xl gap-4" aria-label="Swap balance">
      <div>
        <p className="eyebrow">Move balance</p>
        <h2 className="text-2xl font-semibold tracking-tight">Swap Balance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Move value between Wallet and Earnings. The fee and receiving amount are quoted from the
          current transfer policy.
        </p>
      </div>
      {error && (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}
      {!balances && !error ? (
        <Skeleton className="h-72 w-full" aria-label="Loading transfer balances" />
      ) : balances ? (
        <WalletTransferForm availableBalances={balances} onComplete={load} />
      ) : null}
    </section>
  );
}
