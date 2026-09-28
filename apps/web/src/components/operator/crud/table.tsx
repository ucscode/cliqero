"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { OperatorActionsMenu, type OperatorAction } from "../ui/actions-menu";
import { OperatorActionCell } from "../ui/data-cells";
import { OperatorTableSurface } from "../ui/table-surface";
import { cn } from "@/lib/utils";

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

export function CrudTable<T>({
  items,
  columns,
  getRowKey,
  actions,
  actionLabel,
  footer,
  className,
}: {
  items: readonly T[];
  columns: readonly CrudColumn<T>[];
  getRowKey: (item: T) => string;
  actions?: (item: T) => readonly OperatorAction[];
  actionLabel?: (item: T) => string;
  footer?: ReactNode;
  className?: string;
}) {
  const visibleMobileColumns = columns.filter((column) => !column.hideOnMobile);

  return (
    <>
      <div className="hidden md:block">
        <OperatorTableSurface footer={footer} className={className}>
          <Table>
            <TableHeader>
              <TableRow>
                {columns
                  .filter((column) => !column.hideOnDesktop)
                  .map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(column.align === "right" && "text-right", column.className)}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                {actions && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={getRowKey(item)}>
                  {columns
                    .filter((column) => !column.hideOnDesktop)
                    .map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "min-w-0",
                          column.align === "right" && "text-right",
                          column.className,
                        )}
                      >
                        {column.render(item)}
                      </TableCell>
                    ))}
                  {actions && (
                    <TableCell>
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

      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white md:hidden">
        {items.map((item) => {
          const mobileColumns = [...visibleMobileColumns].sort(
            (left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary)),
          );
          return (
            <article key={getRowKey(item)} className="min-w-0 px-4 py-4">
              <dl className="grid min-w-0 gap-3">
                {mobileColumns.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">
                      {column.mobileLabel ?? column.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 min-w-0 break-words text-sm text-slate-900",
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
