"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { WithdrawalDestination, WithdrawalMethod } from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { CopyValue } from "../../copy-value";
import { EmptyState } from "../../empty-state";
import { Skeleton } from "../../ui/skeleton";
import { Toast } from "../../toast";

export function PayoutMethodsPanel() {
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const [nextMethods, nextDestinations] = await Promise.all([
        apiFetch<WithdrawalMethod[]>("/api/withdrawal-methods"),
        apiFetch<WithdrawalDestination[]>("/api/withdrawal-destinations"),
      ]);
      setMethods(nextMethods);
      setDestinations(nextDestinations);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function archiveDestination(destination: WithdrawalDestination) {
    if (!window.confirm(`Remove “${destination.name}” from payout methods?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      await load();
    } catch {
      setError("This payout method could not be removed. Please try again.");
    }
  }

  return (
    <section className="grid gap-4" aria-label="Payout Methods">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-500">Manage where you receive withdrawals.</p>
        {destinations.length > 0 && (
          <Button asChild disabled={loading}>
            <Link href="/dashboard/payout-methods/new">Add payout method</Link>
          </Button>
        )}
      </div>
      {error && <Toast>{error}</Toast>}
      {loading ? (
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : loadFailed ? (
        <Card className="grid gap-3 p-5">
          <p className="text-sm text-slate-600">
            Your payout methods could not be loaded. Please try again.
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : destinations.length ? (
        <div className="grid gap-3">
          {destinations.map((destination) => (
            <Card key={destination.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3>{destination.name}</h3>
                  <span className="text-sm text-slate-500">{destination.method.display_name}</span>
                  {!destination.method.available && (
                    <span className="text-xs font-semibold text-amber-700">
                      Unavailable for new withdrawals
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {destination.fields.map((field) => (
                    <div key={field.name} className="min-w-0">
                      <dt className="text-xs text-slate-500">{field.label}</dt>
                      <dd className="break-all text-sm font-medium">
                        {field.copyable ? (
                          <CopyValue
                            label={field.label}
                            value={field.value}
                            displayValue={field.displayValue}
                          />
                        ) : (
                          (field.displayValue ?? field.value)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-start gap-2">
                <Button asChild variant="secondary" disabled={!destination.method.available}>
                  <Link
                    href={`/dashboard/payout-methods/${encodeURIComponent(destination.id)}/edit`}
                  >
                    Edit
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void archiveDestination(destination)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No payout methods saved"
            description="Add a bank account, crypto wallet, or another available withdrawal method."
          />
          {!methods.length && (
            <p className="px-5 pb-5 text-sm text-slate-500">
              No withdrawal methods are currently available for your account.
            </p>
          )}
          <div className="px-5 pb-5">
            <Button asChild>
              <Link href="/dashboard/payout-methods/new">Add payout method</Link>
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
