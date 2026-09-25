"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiClientError,
  apiFetch,
  formatMinorCurrency,
  type Withdrawal,
  type WithdrawalPage,
  type WithdrawalPolicy,
  type WithdrawalDestination,
} from "@/lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { HoneypotField } from "../honeypot-field";
import { Toast } from "../toast";
import { Money } from "../money";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { parseWithdrawalAmount, withdrawalRequestErrorField } from "./model";
import { WithdrawalHistoryList } from "./history/list";
import { ActionLock } from "./action-lock";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

export const WITHDRAWAL_HISTORY_PREVIEW_SIZE = 5;

export function WithdrawalsPanel() {
  const [policy, setPolicy] = useState<WithdrawalPolicy | null>(null);
  const [page, setPage] = useState<WithdrawalPage | null>(null);
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [withdrawalToCancel, setWithdrawalToCancel] = useState<Withdrawal | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancellationLock = useRef(new ActionLock());
  const idempotencyKey = useRef<string | null>(null);
  const requestSignature = useRef<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [nextPolicy, nextPage, nextDestinations] = await Promise.all([
        apiFetch<WithdrawalPolicy>("/api/withdrawals/policy"),
        apiFetch<WithdrawalPage>(`/api/withdrawals?limit=${WITHDRAWAL_HISTORY_PREVIEW_SIZE}`),
        apiFetch<WithdrawalDestination[]>("/api/withdrawal-destinations"),
      ]);
      setPolicy(nextPolicy);
      setPage(nextPage);
      setDestinations(nextDestinations.filter((destination) => destination.method.available));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "We couldn’t load withdrawals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial data loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currency = policy?.currency ?? "USD";
  const availableMinor = page?.available_minor ?? "0";
  const reservedMinor =
    page?.reservations.find((reservation) => reservation.currency === currency)?.reserved_minor ??
    "0";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setError(null);
    setAmountError(null);
    setDestinationError(null);
    setRequestError(null);
    setSuccess(null);
    let amountMinor: string;
    try {
      amountMinor = parseWithdrawalAmount(amount, currency);
    } catch (cause) {
      setAmountError(cause instanceof Error ? cause.message : "Enter a valid amount.");
      return;
    }
    if (!policy?.enabled) {
      setRequestError("Withdrawals are currently unavailable.");
      return;
    }
    if (BigInt(amountMinor) < BigInt(policy.minimum_amount_minor)) {
      setAmountError(
        `The minimum withdrawal is ${formatMinorCurrency(policy.minimum_amount_minor, currency)}.`,
      );
      return;
    }
    if (policy.maximum_amount_minor && BigInt(amountMinor) > BigInt(policy.maximum_amount_minor)) {
      setAmountError(
        `The maximum withdrawal is ${formatMinorCurrency(policy.maximum_amount_minor, currency)}.`,
      );
      return;
    }
    if (BigInt(amountMinor) > BigInt(availableMinor)) {
      setAmountError("This amount is greater than your available earnings.");
      return;
    }
    if (!destination.trim()) {
      setDestinationError("Choose a payout method.");
      return;
    }
    const signature = `${amountMinor}|${destination}`;
    if (requestSignature.current !== signature) {
      requestSignature.current = signature;
      idempotencyKey.current = `ui-withdrawal-${crypto.randomUUID()}`;
    }
    setSubmitting(true);
    try {
      await apiFetch<Withdrawal>("/api/withdrawals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current!,
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({
          amount_minor: amountMinor,
          currency,
          destination_id: destination,
        }),
      });
      setSuccess("Withdrawal request received. Payment follows operator review.");
      setAmount("");
      setDestination("");
      requestSignature.current = null;
      idempotencyKey.current = null;
      await load(true);
    } catch (cause) {
      const message =
        cause instanceof ApiClientError ? cause.message : "Withdrawal could not be created.";
      const field = withdrawalRequestErrorField(message);
      if (field === "amount") setAmountError(message);
      else if (field === "destination") setDestinationError(message);
      else setRequestError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancellation() {
    const withdrawal = withdrawalToCancel;
    if (!withdrawal) return;
    await cancellationLock.current.run(async () => {
      setCancelling(true);
      setError(null);
      try {
        await apiFetch<Withdrawal>(`/api/withdrawals/${withdrawal.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        setWithdrawalToCancel(null);
        await load(true);
      } catch (cause) {
        setError(
          cause instanceof ApiClientError ? cause.message : "Withdrawal could not be cancelled.",
        );
      } finally {
        setCancelling(false);
      }
    });
  }

  return (
    <section className="grid gap-4" aria-labelledby="withdrawals-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Withdrawals</p>
          <h2 id="withdrawals-heading" className="text-2xl font-semibold tracking-tight">
            Move available earnings
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Request a withdrawal from your available earnings. Your buyer wallet remains separate.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && <Toast>{error}</Toast>}
      {success && <Toast tone="success">{success}</Toast>}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading withdrawals">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Available earnings</p>
              <h3 className="my-2 text-2xl font-semibold tracking-tight">
                <Money minor={availableMinor} currency={currency} />
              </h3>
              <Link
                className="text-sm font-semibold text-emerald-700"
                href="/dashboard?section=earnings"
              >
                View earnings <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
              </Link>
            </Card>
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Reserved in withdrawals</p>
              <h3 className="my-2 text-2xl font-semibold tracking-tight">
                <Money minor={reservedMinor} currency={currency} />
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Reserved funds are not available for another request.
              </p>
            </Card>
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Minimum request</p>
              <h3 className="my-2 text-2xl font-semibold tracking-tight">
                <Money minor={policy?.minimum_amount_minor ?? "0"} currency={currency} />
              </h3>
              {!policy?.enabled && (
                <p className="text-sm leading-relaxed text-slate-500">
                  Withdrawals are currently disabled.
                </p>
              )}
            </Card>
          </div>
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold tracking-tight">Request a withdrawal</h3>
              <Badge variant={policy?.enabled ? "default" : "secondary"}>
                {policy?.enabled ? "Available" : "Disabled"}
              </Badge>
            </div>
            <form className="grid max-w-2xl gap-3" onSubmit={submit}>
              <Label htmlFor="withdrawal-amount">Amount ({currency})</Label>
              <Input
                id="withdrawal-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setAmountError(null);
                }}
                disabled={!policy?.enabled || submitting}
                aria-invalid={Boolean(amountError)}
                aria-describedby={amountError ? "withdrawal-amount-error" : undefined}
              />
              {amountError && (
                <p className="text-sm text-red-700" id="withdrawal-amount-error" role="alert">
                  {amountError}
                </p>
              )}
              <span className="text-xs text-slate-500">
                Minimum {formatMinorCurrency(policy?.minimum_amount_minor ?? "0", currency)}
                {policy?.maximum_amount_minor
                  ? ` · Maximum ${formatMinorCurrency(policy.maximum_amount_minor, currency)}`
                  : ""}
              </span>
              {destinations.length ? (
                <>
                  <Label htmlFor="withdrawal-destination">Payout method</Label>
                  <Select
                    id="withdrawal-destination"
                    value={destination}
                    onChange={(event) => {
                      setDestination(event.target.value);
                      setDestinationError(null);
                    }}
                    disabled={!policy?.enabled || submitting}
                    aria-invalid={Boolean(destinationError)}
                    aria-describedby={destinationError ? "withdrawal-destination-error" : undefined}
                  >
                    <option value="">Choose a payout method</option>
                    {destinations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.method.display_name}
                      </option>
                    ))}
                  </Select>
                  {destinationError && (
                    <p
                      className="text-sm text-red-700"
                      id="withdrawal-destination-error"
                      role="alert"
                    >
                      {destinationError}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  No payout method is available for withdrawals.
                </p>
              )}
              <Button
                type="submit"
                disabled={!policy?.enabled || submitting || !destinations.length}
              >
                {submitting ? "Submitting…" : "Request withdrawal"}
              </Button>
              {requestError && <Toast>{requestError}</Toast>}
              {!destinations.length && (
                <Button asChild variant="secondary">
                  <Link href="/dashboard/payout-methods/new">Add payout method</Link>
                </Button>
              )}
              <HoneypotField />
            </form>
          </Card>
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold tracking-tight">Withdrawal history</h3>
              <Link
                className="text-sm font-semibold text-emerald-800 underline"
                href="/dashboard/withdrawals/history"
              >
                View full history
              </Link>
            </div>
            <WithdrawalHistoryList
              withdrawals={page?.withdrawals ?? []}
              onCancel={setWithdrawalToCancel}
            />
          </Card>
        </>
      )}
      <Dialog
        open={Boolean(withdrawalToCancel)}
        onOpenChange={(open) => {
          if (!open && !cancelling) setWithdrawalToCancel(null);
        }}
      >
        <DialogContent aria-describedby="withdrawal-cancel-description">
          <DialogHeader>
            <DialogTitle>Cancel withdrawal request?</DialogTitle>
            {withdrawalToCancel && (
              <p id="withdrawal-cancel-description" className="text-sm text-slate-600">
                Cancel the{" "}
                {formatMinorCurrency(withdrawalToCancel.amount_minor, withdrawalToCancel.currency)}
                request to {withdrawalToCancel.destination.name}?
              </p>
            )}
          </DialogHeader>
          {error && <Toast>{error}</Toast>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setWithdrawalToCancel(null)}
              disabled={cancelling}
            >
              Keep request
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmCancellation()}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel withdrawal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
