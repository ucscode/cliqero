"use client";

import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { OperatorActionsMenu, type OperatorAction } from "../operator/ui/actions-menu";
import { OperatorActionCell } from "../operator/ui/data-cells";
import { OperatorTableSurface } from "../operator/ui/table-surface";
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

export type CrudSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onChange: (selectedKeys: Set<string>) => void;
  labelForItem: (item: T) => string;
};

export function visibleSelection<T>(
  items: readonly T[],
  getRowKey: (item: T) => string,
  selectedKeys: ReadonlySet<string>,
  checked: boolean,
) {
  const keys = new Set(selectedKeys);
  for (const item of items) {
    const key = getRowKey(item);
    if (checked) keys.add(key);
    else keys.delete(key);
  }
  return keys;
}

export function visibleSelectionState(visibleCount: number, selectedCount: number) {
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;
  return {
    allSelected,
    indeterminate: selectedCount > 0 && !allSelected,
  };
}

export type CrudTableRowProps<T> = {
  item: T;
  desktopColumns: readonly CrudColumn<T>[];
  actions?: (item: T) => readonly OperatorAction[];
  actionLabel?: (item: T) => string;
  selectionLabel: string | null;
  selected: boolean;
  onToggle: (item: T, checked: boolean) => void;
};

export function crudTableRowPropsEqual<T>(
  previous: CrudTableRowProps<T>,
  next: CrudTableRowProps<T>,
) {
  return (
    previous.item === next.item &&
    previous.desktopColumns === next.desktopColumns &&
    previous.actions === next.actions &&
    previous.actionLabel === next.actionLabel &&
    previous.selectionLabel === next.selectionLabel &&
    previous.selected === next.selected &&
    previous.onToggle === next.onToggle
  );
}

function CrudTableRow<T>({
  item,
  desktopColumns,
  actions,
  actionLabel,
  selectionLabel,
  selected,
  onToggle,
}: CrudTableRowProps<T>) {
  return (
    <TableRow className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-50">
      {selectionLabel !== null && (
        <TableCell className="w-12 px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(item, event.target.checked)}
            aria-label={`Select ${selectionLabel}`}
            className="size-4 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          />
        </TableCell>
      )}
      {desktopColumns.map((column) => (
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
  );
}

const MemoizedCrudTableRow = memo(CrudTableRow, crudTableRowPropsEqual) as typeof CrudTableRow;

export type CrudMobileCardProps<T> = Omit<CrudTableRowProps<T>, "desktopColumns"> & {
  mobileColumns: readonly CrudColumn<T>[];
};

export function crudMobileCardPropsEqual<T>(
  previous: CrudMobileCardProps<T>,
  next: CrudMobileCardProps<T>,
) {
  return (
    previous.item === next.item &&
    previous.mobileColumns === next.mobileColumns &&
    previous.actions === next.actions &&
    previous.actionLabel === next.actionLabel &&
    previous.selectionLabel === next.selectionLabel &&
    previous.selected === next.selected &&
    previous.onToggle === next.onToggle
  );
}

function CrudMobileCard<T>({
  item,
  mobileColumns,
  actions,
  actionLabel,
  selectionLabel,
  selected,
  onToggle,
}: CrudMobileCardProps<T>) {
  return (
    <article className="min-w-0 rounded-md border border-slate-200 bg-white px-4 py-4">
      {selectionLabel !== null && (
        <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(item, event.target.checked)}
            aria-label={`Select ${selectionLabel}`}
            className="size-4 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          />
          <span>{selectionLabel}</span>
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
}

const MemoizedCrudMobileCard = memo(
  CrudMobileCard,
  crudMobileCardPropsEqual,
) as typeof CrudMobileCard;

export function CrudTable<T>({
  items,
  columns,
  getRowKey,
  actions,
  actionLabel,
  footer,
  className,
  selection,
  selectedItems,
}: {
  items: readonly T[];
  columns: readonly CrudColumn<T>[];
  getRowKey: (item: T) => string;
  actions?: (item: T) => readonly OperatorAction[];
  actionLabel?: (item: T) => string;
  footer?: ReactNode;
  className?: string;
  selection?: CrudSelection<T>;
  selectedItems?: readonly T[];
}) {
  const desktopColumns = useMemo(
    () => columns.filter((column) => !column.hideOnDesktop),
    [columns],
  );
  const mobileColumns = useMemo(
    () =>
      columns
        .filter((column) => !column.hideOnMobile)
        .sort((left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary))),
    [columns],
  );
  const visibleSelectedItems =
    selectedItems ?? items.filter((item) => selection?.selectedKeys.has(getRowKey(item)));
  const { allSelected: allVisibleSelected, indeterminate: someVisibleSelected } =
    visibleSelectionState(items.length, visibleSelectedItems.length);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  const toggleRow = useCallback(
    (item: T, checked: boolean) => {
      const currentSelection = selectionRef.current;
      if (!currentSelection) return;
      const key = getRowKey(item);
      const keys = new Set(currentSelection.selectedKeys);
      if (checked) keys.add(key);
      else keys.delete(key);
      currentSelection.onChange(keys);
    },
    [getRowKey],
  );

  function toggleVisible(checked: boolean) {
    if (!selection) return;
    selection.onChange(visibleSelection(items, getRowKey, selection.selectedKeys, checked));
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
                {desktopColumns.map((column) => (
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
                <MemoizedCrudTableRow
                  key={getRowKey(item)}
                  item={item}
                  desktopColumns={desktopColumns}
                  actions={actions}
                  actionLabel={actionLabel}
                  selectionLabel={selection?.labelForItem(item) ?? null}
                  selected={selection?.selectedKeys.has(getRowKey(item)) ?? false}
                  onToggle={toggleRow}
                />
              ))}
            </TableBody>
          </Table>
        </OperatorTableSurface>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <MemoizedCrudMobileCard
            key={getRowKey(item)}
            item={item}
            mobileColumns={mobileColumns}
            actions={actions}
            actionLabel={actionLabel}
            selectionLabel={selection?.labelForItem(item) ?? null}
            selected={selection?.selectedKeys.has(getRowKey(item)) ?? false}
            onToggle={toggleRow}
          />
        ))}
        {footer && <div className="border-t border-slate-200 p-3">{footer}</div>}
      </div>
    </>
  );
}
