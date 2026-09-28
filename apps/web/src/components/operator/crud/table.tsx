"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { OperatorActionsMenu, type OperatorAction } from "../ui/actions-menu";
import { OperatorActionCell } from "../ui/data-cells";
import { OperatorTableSurface } from "../ui/table-surface";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export type CrudColumn<T> = {
  key: string;
  label: ReactNode;
  render: (item: T) => ReactNode;
  mobileLabel?: ReactNode;
  align?: "left" | "right";
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  primary?: boolean;
  className?: string;
};

export type CrudSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onChange: (selectedKeys: Set<string>) => void;
  max: number;
  labelForItem: (item: T) => string;
  onLimitReached?: () => void;
};

export function CrudTable<T>({
  items,
  columns,
  getRowKey,
  actions,
  actionLabel,
  footer,
  className,
  selection,
}: {
  items: readonly T[];
  columns: readonly CrudColumn<T>[];
  getRowKey: (item: T) => string;
  actions?: (item: T) => readonly OperatorAction[];
  actionLabel?: (item: T) => string;
  footer?: ReactNode;
  className?: string;
  selection?: CrudSelection<T>;
}) {
  const visibleMobileColumns = columns.filter((column) => !column.hideOnMobile);
  const visibleItems = items.filter((item) => selection?.selectedKeys.has(getRowKey(item)));
  const allVisibleSelected = Boolean(items.length && visibleItems.length === items.length);
  const someVisibleSelected = visibleItems.length > 0 && !allVisibleSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleRow(item: T, checked: boolean) {
    if (!selection) return;
    const key = getRowKey(item);
    const keys = new Set(selection.selectedKeys);
    if (checked && !keys.has(key) && keys.size >= selection.max) {
      selection.onLimitReached?.();
      return;
    }
    if (checked) keys.add(key);
    else keys.delete(key);
    selection.onChange(keys);
  }

  function toggleVisible(checked: boolean) {
    if (!selection) return;
    const keys = new Set(selection.selectedKeys);
    for (const item of items) {
      const key = getRowKey(item);
      if (checked && !keys.has(key)) {
        if (keys.size >= selection.max) {
          selection.onLimitReached?.();
          break;
        }
        keys.add(key);
      } else if (!checked) keys.delete(key);
    }
    selection.onChange(keys);
  }

  return (
    <>
      <div className="hidden md:block">
        <OperatorTableSurface footer={footer} className={className}>
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                {selection && (
                  <TableHead className="w-12 px-4 py-3">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleVisible(event.target.checked)}
                      aria-label="Select all visible records"
                      className="size-4 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    />
                  </TableHead>
                )}
                {columns
                  .filter((column) => !column.hideOnDesktop)
                  .map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        "px-4 py-3 font-semibold text-slate-700",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                {actions && (
                  <TableHead className="px-4 py-3 text-right font-semibold text-slate-700">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={getRowKey(item)}
                  className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-50"
                >
                  {selection && (
                    <TableCell className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selection.selectedKeys.has(getRowKey(item))}
                        onChange={(event) => toggleRow(item, event.target.checked)}
                        aria-label={`Select ${selection.labelForItem(item)}`}
                        className="size-4 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      />
                    </TableCell>
                  )}
                  {columns
                    .filter((column) => !column.hideOnDesktop)
                    .map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "min-w-0",
                          column.align === "right" && "text-right",
                          "px-4 py-3",
                          column.className,
                        )}
                      >
                        {column.render(item)}
                      </TableCell>
                    ))}
                  {actions && (
                    <TableCell className="px-4 py-3">
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={actions(item)}
                          label={actionLabel?.(item) ?? "Row actions"}
                        />
                      </OperatorActionCell>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OperatorTableSurface>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const mobileColumns = [...visibleMobileColumns].sort(
            (left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary)),
          );
          return (
            <article
              key={getRowKey(item)}
              className="min-w-0 rounded-md border border-slate-200 bg-white px-4 py-4"
            >
              {selection && (
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={selection.selectedKeys.has(getRowKey(item))}
                    onChange={(event) => toggleRow(item, event.target.checked)}
                    aria-label={`Select ${selection.labelForItem(item)}`}
                    className="size-4 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  />
                  <span>{selection.labelForItem(item)}</span>
                </label>
              )}
              <dl className="grid min-w-0 gap-3">
                {mobileColumns.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs font-semibold text-slate-700">
                      {column.mobileLabel ?? column.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 min-w-0 break-words text-sm text-left text-slate-900",
                        column.primary && "font-medium",
                        column.className,
                      )}
                    >
                      {column.render(item)}
                    </dd>
                  </div>
                ))}
              </dl>
              {actions && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                  <span className="text-xs font-medium text-slate-500">Actions</span>
                  <OperatorActionsMenu
                    actions={actions(item)}
                    label={actionLabel?.(item) ?? "Row actions"}
                  />
                </div>
              )}
            </article>
          );
        })}
        {footer && <div className="border-t border-slate-200 p-3">{footer}</div>}
      </div>
    </>
  );
}
