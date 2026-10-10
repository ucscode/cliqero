"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, formatMinorUsd, parseUsdMinor } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Alert } from "../ui/alert";

type WalletName = "funding" | "earnings";
export function walletSwapDestination(from: WalletName): WalletName {
  return from === "funding" ? "earnings" : "funding";
}

export function walletBalanceNameLabel(name: WalletName) {
  return name === "funding" ? "Wallet" : "Earnings";
}
type Quote = {
  gross_amount_minor: string;
  fee_minor: string;
  net_amount_minor: string;
  currency: "USD";
};
type KeyedQuote = { key: string; quote: Quote };

export function WalletTransferForm({
  onComplete,
  availableBalances,
}: {
  onComplete: () => void | Promise<void>;
  availableBalances?: { funding: string; earnings: string };
}) {
  const [from, setFrom] = useState<WalletName>("funding");
  const to = walletSwapDestination(from);
  const [amount, setAmount] = useState("");
  const [transactionPin, setTransactionPin] = useState("");
  const [keyedQuote, setKeyedQuote] = useState<KeyedQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quoteKey = `${from}:${amount}`;
  const quote = keyedQuote?.key === quoteKey ? keyedQuote.quote : null;

  useEffect(() => {
    if (!amount) return;
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      void apiFetch<Quote>(`/api/wallet/transfer-quote?from=${from}&amount_minor=${amountMinor}`)
        .then((nextQuote) => setKeyedQuote({ key: quoteKey, quote: nextQuote }))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [from, amount, quoteKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const amountMinor = parseUsdMinor(amount);
      if (availableBalances && BigInt(amountMinor) > BigInt(availableBalances[from]))
        throw new Error("The amount exceeds the available source balance.");
      await apiFetch("/api/wallet/transfers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `wallet-transfer-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          from,
          to,
          amount_minor: amountMinor,
          transaction_pin: transactionPin,
        }),
      });
      setAmount("");
      setTransactionPin("");
      setKeyedQuote(null);
      await onComplete();
      setSuccess("Swap complete. Your updated balances are shown above.");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "The transfer could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <div>
        <p className="eyebrow">Wallet ↔ Earnings</p>
        <h2 className="text-xl font-semibold tracking-tight">Swap balance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Swaps preserve value before the configured platform fee.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-4 md:col-span-2 md:grid-cols-2" aria-label="Swap direction">
          <div className="grid gap-2">
            <Label htmlFor="transfer-from">From</Label>
            <Select
              id="transfer-from"
              value={from}
              onChange={(event) => setFrom(event.target.value as WalletName)}
            >
              <option value="funding">Wallet</option>
              <option value="earnings">Earnings</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>To</Label>
            <p className="flex min-h-[42px] items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
              {walletBalanceNameLabel(to)}
            </p>
          </div>
        </div>
        <div className="grid content-center gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm md:col-span-2">
          <span className="text-slate-600">Available in {walletBalanceNameLabel(from)}</span>
          <strong>
            {availableBalances ? formatMinorUsd(availableBalances[from]) : "Loading…"}
          </strong>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="transfer-amount">Amount (USD)</Label>
          <Input
            id="transfer-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="grid content-center gap-1 text-sm">
          <p>
            Fee <span className="float-right">{quote ? formatMinorUsd(quote.fee_minor) : "—"}</span>
          </p>
          <p className="font-semibold">
            You receive{" "}
            <span className="float-right">
              {quote ? formatMinorUsd(quote.net_amount_minor) : "—"}
            </span>
          </p>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="transfer-transaction-pin">Transaction PIN</Label>
          <Input
            id="transfer-transaction-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={transactionPin}
            onChange={(event) =>
              setTransactionPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
          />
          <p className="text-xs text-slate-500">
            Verify your email and set a transaction PIN in Settings before swapping.
          </p>
        </div>
        {error && (
          <div className="md:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        {success && (
          <div className="md:col-span-2">
            <Alert role="status">{success}</Alert>
          </div>
        )}
        <div className="md:col-span-2">
          <Button disabled={busy || !quote || !availableBalances}>
            {busy ? "Swapping…" : "Swap balance"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
