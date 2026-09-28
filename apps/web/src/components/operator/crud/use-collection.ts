"use client";

import { useCallback, useEffect, useState } from "react";
import { CrudCollectionController } from "./collection-controller";
import { apiFetch } from "@/lib/api-client";

export type CrudPage<T> = { items: T[]; nextCursor: string | null };
export type CrudPageReader<TFilters, TItem> = (
  filters: TFilters,
  cursor: string | null,
  pageSize: number,
) => Promise<CrudPage<TItem>>;

/** React adapter for the collection controller; drafts stay in the owning filter controls. */
export function useCrudCollection<TFilters, TItem>(
  readPage: CrudPageReader<TFilters, TItem>,
  initialFilters: TFilters,
) {
  const [controller] = useState(() => new CrudCollectionController(readPage, initialFilters, 1));
  useEffect(() => controller.setReader(readPage), [controller, readPage]);
  const [items, setItems] = useState<TItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [maxBulkSelection, setMaxBulkSelection] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let configurationError: string | null = null;
    void apiFetch<{
      tables: {
        defaultPageSize: number;
        pageSizeOptions: number[];
        maxBulkSelection: number;
      };
    }>("/api/operator/table-config")
      .then(async ({ tables }) => {
        if (!active) return;
        controller.setInitialPageSize(tables.defaultPageSize);
        setPageSizeOptions(tables.pageSizeOptions);
        setMaxBulkSelection(tables.maxBulkSelection);
        setLoading(true);
        await controller.apply(initialFilters, tables.defaultPageSize);
      })
      .catch((cause) => {
        if (active) {
          configurationError =
            cause instanceof Error ? cause.message : "Operator table settings unavailable.";
        }
      })
      .finally(() => {
        if (!active) return;
        setItems([...controller.items]);
        setNextCursor(controller.hasNext ? controller.nextCursorValue : null);
        setHasNext(controller.hasNext);
        setHasPrevious(controller.hasPrevious);
        setError(controller.error ?? configurationError);
        setInitialized(controller.initialized);
        setPageSize(controller.currentPageSize || null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
    // The controller captures initialFilters once; subsequent filter changes are explicit applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  const run = useCallback(
    async (operation: () => Promise<boolean>) => {
      setLoading(true);
      try {
        return await operation();
      } finally {
        setItems([...controller.items]);
        setNextCursor(controller.hasNext ? controller.nextCursorValue : null);
        setHasNext(controller.hasNext);
        setHasPrevious(controller.hasPrevious);
        setError(controller.error);
        setLoading(false);
        setInitialized(controller.initialized);
        setPageSize(controller.currentPageSize);
      }
    },
    [controller],
  );

  const apply = useCallback(
    (filters: TFilters) => run(() => controller.apply(filters)),
    [controller, run],
  );
  const next = useCallback(() => run(() => controller.next()), [controller, run]);
  const previous = useCallback(() => run(() => controller.previous()), [controller, run]);
  const retry = useCallback(() => run(() => controller.retry()), [controller, run]);
  const refresh = useCallback(() => run(() => controller.refresh()), [controller, run]);
  const changePageSize = useCallback(
    (value: number) => run(() => controller.setPageSize(value)),
    [controller, run],
  );

  const pageSizeControl =
    pageSize !== null && pageSizeOptions.length
      ? { value: pageSize, options: pageSizeOptions, onChange: changePageSize }
      : undefined;

  return {
    items,
    nextCursor,
    hasNext,
    hasPrevious,
    loading,
    initialized,
    pageSize,
    pageSizeOptions,
    maxBulkSelection,
    pageSizeControl,
    error,
    apply,
    next,
    previous,
    retry,
    refresh,
    changePageSize,
  };
}
