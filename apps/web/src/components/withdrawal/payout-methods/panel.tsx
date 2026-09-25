"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { WithdrawalDestination, WithdrawalMethod } from "@/lib/api-client";
import { ActionLock } from "../action-lock";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { EmptyState } from "../../empty-state";
import { Skeleton } from "../../ui/skeleton";
import { Toast } from "../../toast";

export function PayoutMethodsPanel() {
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinationToArchive, setDestinationToArchive] = useState<WithdrawalDestination | null>(
    null,
  );
  const [archiving, setArchiving] = useState(false);
  const archiveLock = useRef(new ActionLock());

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

  async function confirmArchive() {
    const destination = destinationToArchive;
    if (!destination) return;
    await archiveLock.current.run(async () => {
      setArchiving(true);
      setError(null);
      try {
        await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        });
        setDestinationToArchive(null);
        await load();
      } catch {
        setError("This payout method could not be removed. Please try again.");
      } finally {
        setArchiving(false);
      }
    });
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
            <Card key={destination.id} className="grid gap-4 p-5">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-slate-500">{destination.method.display_name}</p>
                      {!destination.method.available && (
                        <span className="text-xs font-semibold text-amber-700">
                          Unavailable for new withdrawals
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 break-words text-lg font-semibold tracking-tight">
                      {destination.name}
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
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
                      onClick={() => setDestinationToArchive(destination)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {destination.fields
                    .filter((field) => field.type !== "hidden")
                    .map((field) => (
                      <div key={field.name} className="min-w-0">
                        <dt className="text-xs text-slate-500">{field.label}</dt>
                        <dd className="break-all text-sm font-medium">
                          {field.displayValue ?? field.value}
                        </dd>
                      </div>
                    ))}
                </dl>
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
      <Dialog
        open={Boolean(destinationToArchive)}
        onOpenChange={(open) => {
          if (!open && !archiving) setDestinationToArchive(null);
        }}
      >
        <DialogContent aria-describedby="payout-method-remove-description">
          <DialogHeader>
            <DialogTitle>Remove payout method?</DialogTitle>
            {destinationToArchive && (
              <p id="payout-method-remove-description" className="text-sm text-slate-600">
                Remove “{destinationToArchive.name}” from your payout methods?
              </p>
            )}
          </DialogHeader>
          {error && <Toast>{error}</Toast>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDestinationToArchive(null)}
              disabled={archiving}
            >
              Keep payout method
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmArchive()}
              disabled={archiving}
            >
              {archiving ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
