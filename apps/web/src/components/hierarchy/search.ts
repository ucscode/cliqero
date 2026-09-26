export interface HierarchySearchItem {
  id: string;
  username: string;
  displayName: string | null;
}

export type HierarchySearchState =
  | { status: "loading" }
  | { status: "success"; items: HierarchySearchItem[] }
  | { status: "error"; message: string };

export function hierarchySearchPath(query: string): string {
  const params = new URLSearchParams({ q: query.trim(), limit: "10" });
  return `/api/hierarchy/search?${params}`;
}

export function moveHierarchySearchSelection(
  currentIndex: number,
  direction: -1 | 1,
  resultCount: number,
): number {
  if (resultCount === 0) return -1;
  if (direction === 1) return (currentIndex + 1) % resultCount;
  return currentIndex <= 0 ? resultCount - 1 : currentIndex - 1;
}

export class HierarchySearchController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private generation = 0;

  constructor(
    private readonly fetcher: (
      path: string,
      signal: AbortSignal,
    ) => Promise<{ items: HierarchySearchItem[] }>,
    private readonly debounceMs = 300,
  ) {}

  schedule(query: string, report: (state: HierarchySearchState) => void): void {
    this.cancel();
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      const request = new AbortController();
      this.request = request;
      report({ status: "loading" });
      void this.fetcher(hierarchySearchPath(normalized), request.signal)
        .then(({ items }) => {
          if (request.signal.aborted || generation !== this.generation) return;
          report({ status: "success", items: items.slice(0, 10) });
        })
        .catch((cause: unknown) => {
          if (request.signal.aborted || generation !== this.generation) return;
          report({
            status: "error",
            message: cause instanceof Error ? cause.message : "We couldn’t search your network.",
          });
        });
    }, this.debounceMs);
  }

  cancel(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.abort();
    this.request = null;
  }
}
