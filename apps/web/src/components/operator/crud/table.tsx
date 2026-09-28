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
            <TableHeader className="bg-slate-100">
              <TableRow>
                {columns
                  .filter((column) => !column.hideOnDesktop)
                  .map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        "h-9 font-semibold text-slate-700",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                {actions && (
                  <TableHead className="h-9 text-right font-semibold text-slate-700">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={getRowKey(item)}
                  className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-100"
                >
                  {columns
                    .filter((column) => !column.hideOnDesktop)
                    .map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "min-w-0",
                          column.align === "right" && "text-right",
                          "py-3",
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

      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const mobileColumns = [...visibleMobileColumns].sort(
            (left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary)),
          );
          return (
            <article
              key={getRowKey(item)}
              className="min-w-0 rounded-md border border-slate-200 bg-white px-4 py-4 even:bg-slate-50/70"
            >
              <dl className="grid min-w-0 gap-3">
                {mobileColumns.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs font-semibold text-slate-700">
                      {column.mobileLabel ?? column.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 min-w-0 break-words text-sm text-slate-900",
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
