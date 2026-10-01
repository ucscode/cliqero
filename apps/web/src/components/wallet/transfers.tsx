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
type Quote = {
  gross_amount_minor: string;
  fee_minor: string;
  net_amount_minor: string;
  currency: "USD";
};
type KeyedQuote = { key: string; quote: Quote };

export function WalletTransferForm({ onComplete }: { onComplete: () => void }) {
  const [from, setFrom] = useState<WalletName>("funding");
  const to: WalletName = from === "funding" ? "earnings" : "funding";
  const [amount, setAmount] = useState("");
  const [keyedQuote, setKeyedQuote] = useState<KeyedQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      void apiFetch<Quote>(`/api/wallet/transfers?from=${from}&amount_minor=${amountMinor}`)
        .then((nextQuote) => setKeyedQuote({ key: quoteKey, quote: nextQuote }))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [from, amount, quoteKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amountMinor = parseUsdMinor(amount);
      await apiFetch("/api/wallet/transfers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `wallet-transfer-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ from, to, amount_minor: amountMinor }),
      });
      setAmount("");
      setKeyedQuote(null);
      onComplete();
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
        <p className="eyebrow">Move balance</p>
        <h2 className="text-xl font-semibold tracking-tight">Transfer balance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Transfers preserve value before the configured platform fee.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="transfer-from">From</Label>
          <Select
            id="transfer-from"
            value={from}
            onChange={(event) => setFrom(event.target.value as WalletName)}
          >
            <option value="funding">Funding</option>
            <option value="earnings">Earnings</option>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="transfer-to">To</Label>
          <Select id="transfer-to" value={to} disabled>
            <option value={to}>{to === "funding" ? "Funding" : "Earnings"}</option>
          </Select>
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
        <div className="grid content-end gap-1 text-sm">
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
        {error && (
          <div className="md:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="md:col-span-2">
          <Button disabled={busy || !quote}>{busy ? "Transferring…" : "Transfer balance"}</Button>
        </div>
      </form>
    </Card>
  );
}
