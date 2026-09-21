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

export function referralRootFromUrl(href: string): string | null {
  return new URL(href).searchParams.get("root");
}

export function referralHistoryUrl(href: string, rootId: string | null): string {
  const url = new URL(href);
  url.searchParams.set("section", "referrals");
  if (rootId) url.searchParams.set("root", rootId);
  else url.searchParams.delete("root");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pushReferralHistory(
  rootId: string | null,
  history: Pick<History, "pushState">,
  href: string,
): void {
  const prototype = Object.getPrototypeOf(history) as { pushState?: History["pushState"] } | null;
  const pushState = prototype?.pushState ?? history.pushState;
  pushState.call(history, null, "", referralHistoryUrl(href, rootId));
}

export function replaceReferralHistory(
  rootId: string | null,
  history: Pick<History, "replaceState">,
  href: string,
): void {
  const prototype = Object.getPrototypeOf(history) as {
    replaceState?: History["replaceState"];
  } | null;
  const replaceState = prototype?.replaceState ?? history.replaceState;
  replaceState.call(history, null, "", referralHistoryUrl(href, rootId));
}
