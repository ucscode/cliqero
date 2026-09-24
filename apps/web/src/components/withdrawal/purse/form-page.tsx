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
import { PurseForm } from "./form";

const purseListHref = "/dashboard?section=purse";

export function PurseFormPage({
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
      router.replace(purseListHref);
      router.refresh();
    } catch {
      setError("The purse could not be saved. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  const editMethod = destination
    ? methods.find((method) => method.id === destination.method.id)
    : null;
  const canEdit = Boolean(destination?.method.available && editMethod);

  return (
    <section className="grid gap-4" aria-labelledby="purse-form-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Purse</p>
          <h2 id="purse-form-heading">{mode === "create" ? "Add purse" : "Edit purse"}</h2>
        </div>
        <Button asChild variant="secondary">
          <Link href={purseListHref}>Back to Purse</Link>
        </Button>
      </div>
      {loading ? (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      ) : loadFailed ? (
        <Card className="grid gap-3 p-5">
          <EmptyState
            title="Purse form unavailable"
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
            title="Purse not found"
            description="This purse could not be found for your account."
          />
        </Card>
      ) : mode === "edit" && !canEdit ? (
        <Card>
          <EmptyState
            title="Purse unavailable for editing"
            description="This withdrawal method is not currently available for your account."
          />
        </Card>
      ) : mode === "create" && methods.length === 0 ? (
        <Card>
          <EmptyState
            title="No withdrawal methods available"
            description="There are no withdrawal methods currently available for your account."
          />
        </Card>
      ) : (
        <Card className="p-5">
          <PurseForm
            methods={methods}
            destination={mode === "edit" ? destination : null}
            saving={saving}
            error={error}
            onSave={(input) => void save(input)}
            onCancel={() => router.push(purseListHref)}
          />
        </Card>
      )}
    </section>
  );
}
