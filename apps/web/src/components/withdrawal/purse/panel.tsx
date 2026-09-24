"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { WithdrawalDestination, WithdrawalMethod } from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { CopyValue } from "../../copy-value";
import { EmptyState } from "../../empty-state";
import { Skeleton } from "../../ui/skeleton";
import { Toast } from "../../toast";
import { DestinationDialog } from "./destination-dialog";

export function PursePanel() {
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [editing, setEditing] = useState<WithdrawalDestination | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function addDestination() {
    setEditing(null);
    setSuccess(null);
    setError(null);
    setDialogOpen(true);
  }

  function editDestination(destination: WithdrawalDestination) {
    if (
      !destination.method.available ||
      !methods.some((method) => method.id === destination.method.id)
    )
      return;
    setEditing(destination);
    setSuccess(null);
    setError(null);
    setDialogOpen(true);
  }

  async function saveDestination() {
    const wasEditing = editing !== null;
    setEditing(null);
    setDialogOpen(false);
    setSuccess(wasEditing ? "Destination updated." : "Destination saved.");
    await load();
  }

  async function archiveDestination(destination: WithdrawalDestination) {
    if (!window.confirm(`Remove “${destination.name}” from your purse?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      setSuccess("Destination removed from your purse.");
      await load();
    } catch {
      setError("This destination could not be removed. Please try again.");
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="purse-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Money</p>
          <h2 id="purse-heading">Purse</h2>
          <p className="mt-2 text-sm text-slate-500">Save where you want to receive withdrawals.</p>
        </div>
        {destinations.length > 0 && (
          <Button type="button" onClick={addDestination} disabled={!methods.length || loading}>
            Add destination
          </Button>
        )}
      </div>
      {error && <Toast>{error}</Toast>}
      {success && <Toast tone="success">{success}</Toast>}
      {loading ? (
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : loadFailed ? (
        <Card className="grid gap-3 p-5">
          <p className="text-sm text-slate-600">
            Your purse could not be loaded. Please try again.
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
                  {destination.method.image_url && (
                    <img
                      src={destination.method.image_url}
                      alt=""
                      className="h-6 w-6 object-contain"
                    />
                  )}
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
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!destination.method.available}
                  onClick={() => editDestination(destination)}
                >
                  Edit
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
            title="Your purse is empty"
            description="Add a bank account, crypto wallet, or another available withdrawal method."
          />
          {!methods.length && (
            <p className="px-5 pb-5 text-sm text-slate-500">
              No withdrawal methods are currently available for your account.
            </p>
          )}
          <div className="px-5 pb-5">
            <Button type="button" onClick={addDestination} disabled={!methods.length}>
              Add destination
            </Button>
          </div>
        </Card>
      )}
      {dialogOpen && (
        <DestinationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          methods={methods}
          destination={editing}
          onSaved={saveDestination}
        />
      )}
    </section>
  );
}
