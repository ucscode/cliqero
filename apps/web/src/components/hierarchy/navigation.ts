import type { HierarchyTree } from "@/lib/api-client";

export type HierarchyTreeFetcher = <T>(path: string) => Promise<T>;

export type HierarchyRebaseHandlers<T> = {
  setTree: (tree: T) => void;
  setLoading: (loading: boolean) => void;
  onSuccess: () => void;
  onError: (cause: unknown) => void;
};

export function hierarchyTreePath(rootId: string | null): string {
  return rootId ? `/api/hierarchy/tree?root=${encodeURIComponent(rootId)}` : "/api/hierarchy/tree";
}

export function fetchHierarchyTree(
  rootId: string | null,
  fetcher: HierarchyTreeFetcher,
): Promise<HierarchyTree> {
  return fetcher<HierarchyTree>(hierarchyTreePath(rootId));
}

export async function runHierarchyRebase<T>(
  load: () => Promise<T>,
  handlers: HierarchyRebaseHandlers<T>,
): Promise<boolean> {
  handlers.setLoading(true);
  try {
    const nextTree = await load();
    handlers.setTree(nextTree);
    handlers.onSuccess();
    return true;
  } catch (cause) {
    handlers.onError(cause);
    return false;
  } finally {
    handlers.setLoading(false);
  }
}

export function hierarchyRootFromUrl(href: string): string | null {
  return new URL(href).searchParams.get("root");
}

export function hierarchyHistoryUrl(href: string, rootId: string | null): string {
  const url = new URL(href);
  url.searchParams.set("section", "hierarchy");
  if (rootId) url.searchParams.set("root", rootId);
  else url.searchParams.delete("root");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pushHierarchyHistory(
  rootId: string | null,
  history: Pick<History, "pushState">,
  href: string,
): void {
  history.pushState(null, "", hierarchyHistoryUrl(href, rootId));
}

export function replaceHierarchyHistory(
  rootId: string | null,
  history: Pick<History, "replaceState">,
  href: string,
): void {
  history.replaceState(null, "", hierarchyHistoryUrl(href, rootId));
}
