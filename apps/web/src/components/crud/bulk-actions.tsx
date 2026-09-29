"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

export type CrudBulkAction<T> = {
  value: string;
  label: string;
  destructive?: boolean;
  onSelect: (items: readonly T[]) => void | boolean | Promise<void | boolean>;
};

export function assertUniqueCrudBulkActionValues<T>(actions: readonly CrudBulkAction<T>[]) {
  const values = new Set<string>();
  for (const action of actions) {
    if (values.has(action.value))
      throw new Error(`Duplicate CRUD bulk action value: ${action.value}`);
    values.add(action.value);
  }
}

export function canApplyCrudBulkAction(selectedCount: number, actionValue: string, busy: boolean) {
  return selectedCount > 0 && Boolean(actionValue) && !busy;
}

export function formatCrudSelectedCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"} selected`;
}

export async function runCrudBulkAction<T>(
  action: CrudBulkAction<T>,
  items: readonly T[],
  onComplete: () => void,
) {
  const completed = await action.onSelect(items);
  if (completed === false) return false;
  onComplete();
  return true;
}

export function CrudBulkActions<T>({
  items,
  selectedCount,
  actions,
  onComplete,
}: {
  items: readonly T[];
  selectedCount: number;
  actions: readonly CrudBulkAction<T>[];
  onComplete: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  assertUniqueCrudBulkActionValues(actions);

  async function apply() {
    if (!canApplyCrudBulkAction(items.length, selectedAction, busyRef.current)) return;
    const action = actions.find(({ value }) => value === selectedAction);
    if (!action) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const completed = await runCrudBulkAction(action, items, () => {
        setSelectedAction("");
        onComplete();
      });
      if (!completed) return;
    } catch {
      setError("Unable to apply this action. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const countLabel = formatCrudSelectedCount(selectedCount);
  if (actions.length === 0)
    return (
      <p className="text-sm text-slate-600" aria-live="polite">
        {countLabel}
      </p>
    );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Bulk actions"
          value={selectedAction}
          disabled={busy}
          onChange={(event) => setSelectedAction(event.target.value)}
          className="w-auto min-w-44 max-w-full"
        >
          <option value="">Bulk actions</option>
          {actions.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="action"
          size="sm"
          disabled={!canApplyCrudBulkAction(items.length, selectedAction, busy)}
          onClick={() => void apply()}
        >
          {busy ? "Applying…" : "Apply"}
        </Button>
        <span className="text-sm text-slate-600" aria-live="polite">
          {countLabel}
        </span>
      </div>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
