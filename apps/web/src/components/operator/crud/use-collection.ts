"use client";

import { useCallback, useEffect, useState } from "react";
import { CrudCollectionController } from "./collection-controller";

export type CrudPage<T> = { items: T[]; nextCursor: string | null };
export type CrudPageReader<TFilters, TItem> = (
  filters: TFilters,
  cursor: string | null,
) => Promise<CrudPage<TItem>>;

/** React adapter for the collection controller; drafts stay in the owning filter controls. */
export function useCrudCollection<TFilters, TItem>(
  readPage: CrudPageReader<TFilters, TItem>,
  initialFilters: TFilters,
) {
  const [controller] = useState(() => new CrudCollectionController(readPage, initialFilters));
  useEffect(() => controller.setReader(readPage), [controller, readPage]);
  const [items, setItems] = useState<TItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    error,
    apply,
    next,
    previous,
    retry,
    refresh,
  };
}
