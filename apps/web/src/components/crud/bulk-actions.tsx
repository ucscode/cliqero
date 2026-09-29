"use client";

import { useState } from "react";
import { Button } from "../ui/button";

export type CrudBulkAction<T> = {
  label: string;
  destructive?: boolean;
  onSelect: (items: readonly T[]) => void | boolean | Promise<void | boolean>;
};

export async function runCrudBulkAction<T>(
  action: CrudBulkAction<T>,
  items: readonly T[],
  onComplete: () => void,
) {
  const completed = await action.onSelect(items);
  if (completed !== false) onComplete();
}

export function CrudBulkActions<T>({
  items,
  actions,
  onComplete,
}: {
  items: readonly T[];
  actions: readonly CrudBulkAction<T>[];
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!items.length || !actions.length) return null;

  async function run(action: CrudBulkAction<T>) {
    if (busy) return;
    setBusy(true);
    try {
      await runCrudBulkAction(action, items, onComplete);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="mr-1 text-sm font-semibold text-slate-700" aria-live="polite">
        {items.length} selected
      </span>
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant={action.destructive ? "destructive" : "secondary"}
          size="sm"
          disabled={busy}
          onClick={() => void run(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
