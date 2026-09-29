"use client";

import { useCallback, useEffect, useState } from "react";
import { CrudCollectionController } from "./collection-controller";
import { useCrudMaxRows } from "./configuration";

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
  maxRowsOverride?: number,
) {
  const maxRows = useCrudMaxRows(maxRowsOverride);
  const [controller] = useState(
    () => new CrudCollectionController(readPage, initialFilters, maxRows),
  );
  useEffect(() => controller.setReader(readPage), [controller, readPage]);
  const [items, setItems] = useState<TItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void controller.initialize(initialFilters).finally(() => {
      if (!active) return;
      setItems([...controller.items]);
      setNextCursor(controller.hasNext ? controller.nextCursorValue : null);
      setHasNext(controller.hasNext);
      setHasPrevious(controller.hasPrevious);
      setError(controller.error);
      setInitialized(controller.initialized);
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
  return {
    items,
    nextCursor,
    hasNext,
    hasPrevious,
    loading,
    initialized,
    error,
    apply,
    next,
    previous,
    retry,
    refresh,
  };
}
