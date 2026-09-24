"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import type { WithdrawalDestination, WithdrawalMethod } from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { EmptyState } from "../../empty-state";
import { Skeleton } from "../../ui/skeleton";
import { PayoutMethodForm } from "./form";

const payoutMethodsHref = "/dashboard?section=payout-methods";

export function PayoutMethodFormPage({
  mode,
  destinationId,
}: {
  mode: "create" | "edit";
  destinationId?: string;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [destination, setDestination] = useState<WithdrawalDestination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [availableMethods, savedDestination] = await Promise.all([
        apiFetch<WithdrawalMethod[]>("/api/withdrawal-methods"),
        mode === "edit" && destinationId
          ? apiFetch<WithdrawalDestination>(`/api/withdrawal-destinations/${destinationId}`)
          : Promise.resolve(null),
      ]);
      setMethods(availableMethods);
      setDestination(savedDestination);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [destinationId, mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(input: { methodId: string; name: string; values: Record<string, string> }) {
    setSaving(true);
    setError(null);
    try {
      if (mode === "edit" && destination) {
        await apiFetch(`/api/withdrawal-destinations/${destination.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: input.name, values: input.values }),
        });
      } else {
        await apiFetch("/api/withdrawal-destinations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            method: input.methodId,
            name: input.name,
            values: input.values,
          }),
        });
      }
      router.replace(payoutMethodsHref);
      router.refresh();
    } catch {
      setError("The payout method could not be saved. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  const editMethod = destination
    ? methods.find((method) => method.id === destination.method.id)
    : null;
  const canEdit = Boolean(destination?.method.available && editMethod);

  return (
    <section className="grid gap-4" aria-label="Payout method form">
      <div className="flex justify-end">
        <Button asChild variant="secondary">
          <Link href={payoutMethodsHref}>Back to Payout Methods</Link>
        </Button>
      </div>
      {loading ? (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      ) : loadFailed ? (
        <Card className="grid gap-3 p-5">
          <EmptyState
            title="Payout method form unavailable"
            description="We couldn’t load the required information. Please try again."
          />
          <div>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : mode === "edit" && !destination ? (
        <Card>
          <EmptyState
            title="Payout method not found"
            description="This payout method could not be found for your account."
          />
        </Card>
      ) : mode === "edit" && !canEdit ? (
        <Card>
          <EmptyState
            title="Payout method unavailable for editing"
            description="This withdrawal method is not currently available for your account."
          />
        </Card>
      ) : mode === "create" && methods.length === 0 ? (
        <Card>
          <EmptyState
            title="No payout methods available"
            description="There are no withdrawal methods currently available for your account."
          />
        </Card>
      ) : (
        <Card className="p-5">
          <PayoutMethodForm
            methods={methods}
            destination={mode === "edit" ? destination : null}
            saving={saving}
            error={error}
            onSave={(input) => void save(input)}
            onCancel={() => router.push(payoutMethodsHref)}
          />
        </Card>
      )}
    </section>
  );
}
