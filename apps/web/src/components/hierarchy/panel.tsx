"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type HierarchyChildren,
  type HierarchyTree,
} from "@/lib/api-client";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { HierarchyGraph } from "./graph";
import { mergeHierarchyChildren } from "./graph/model";
import { HierarchySearchController, moveHierarchySearchSelection } from "./search";
import {
  fetchHierarchyTree,
  hierarchyRootFromUrl,
  pushHierarchyHistory,
  replaceHierarchyHistory,
  runHierarchyRebase,
} from "./navigation";

export function HierarchyPanel() {
  const params = useSearchParams();
  const [initialRootParam] = useState(() => params.get("root"));
  const [selfAccountId, setSelfAccountId] = useState<string | null>(null);
  const [tree, setTree] = useState<HierarchyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState<string | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<
    Array<{ id: string; username: string; displayName: string | null }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const hierarchyLoadingRef = useRef(false);
  const retryRootRef = useRef<string | null | undefined>(undefined);
  const lastSuccessfulUrlRef = useRef<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchControllerRef = useRef<HierarchySearchController | null>(null);
  if (searchControllerRef.current == null) {
    searchControllerRef.current = new HierarchySearchController((path, signal) =>
      apiFetch<{ items: Array<{ id: string; username: string; displayName: string | null }> }>(
        path,
        {
          signal,
        },
      ),
    );
  }

  const loadPanel = useCallback(async (rootId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [profile, hierarchy] = await Promise.all([
        apiFetch<{ id: string }>("/api/me/profile"),
        fetchHierarchyTree(rootId, apiFetch),
      ]);
      setSelfAccountId(profile.id);
      setTree(hierarchy);
      lastSuccessfulUrlRef.current = window.location.href;
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load your hierarchy.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPanel(initialRootParam);
  }, [initialRootParam, loadPanel]);

  useEffect(() => {
    const controller = searchControllerRef.current!;
    controller.schedule(searchQuery, (state) => {
      setSearchLoading(state.status === "loading");
      setSearchCompleted(state.status === "success");
      setSearchItems(state.status === "success" ? state.items : []);
      setSearchError(state.status === "error" ? state.message : null);
      setActiveSearchIndex(-1);
    });
    return () => controller.cancel();
  }, [searchQuery]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!searchContainerRef.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const refreshPanel = useCallback(() => {
    void loadPanel(hierarchyRootFromUrl(window.location.href));
  }, [loadPanel]);

  const rebaseHierarchy = useCallback(async (rootId: string | null, updateHistory: boolean) => {
    if (hierarchyLoadingRef.current) return;
    const previousUrl = lastSuccessfulUrlRef.current ?? window.location.href;
    hierarchyLoadingRef.current = true;
    retryRootRef.current = rootId;
    setError(null);
    await runHierarchyRebase(() => fetchHierarchyTree(rootId, apiFetch), {
      setTree,
      setLoading: setHierarchyLoading,
      onSuccess: () => {
        if (updateHistory) {
          pushHierarchyHistory(rootId, window.history, window.location.href);
        }
        lastSuccessfulUrlRef.current = window.location.href;
        retryRootRef.current = undefined;
      },
      onError: (cause) => {
        if (!updateHistory && previousUrl !== window.location.href) {
          replaceHierarchyHistory(hierarchyRootFromUrl(previousUrl), window.history, previousUrl);
        }
        setError(
          cause instanceof ApiClientError
            ? cause.message
            : "We couldn’t load that hierarchy branch.",
        );
      },
    });
    hierarchyLoadingRef.current = false;
  }, []);

  useEffect(() => {
    function handlePopState() {
      void rebaseHierarchy(hierarchyRootFromUrl(window.location.href), false);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [rebaseHierarchy]);

  const loadMoreChildren = useCallback(
    async (parentId: string) => {
      if (!tree || loadingChildren) return;
      const parent = tree.nodes.find((node) => node.id === parentId);
      if (!parent?.hasMoreChildren || !parent.nextChildCursor || parent.depth >= tree.windowDepth)
        return;
      setLoadingChildren(parentId);
      setError(null);
      try {
        const page = await apiFetch<HierarchyChildren>(
          `/api/hierarchy/children/${parentId}?cursor=${encodeURIComponent(parent.nextChildCursor)}`,
        );
        setTree((current) => (current ? mergeHierarchyChildren(current, page) : current));
      } catch (cause) {
        setError(
          cause instanceof ApiClientError
            ? cause.message
            : "We couldn’t load more hierarchy members.",
        );
      } finally {
        setLoadingChildren(null);
      }
    },
    [loadingChildren, tree],
  );

  const openRoot = useCallback(
    (id: string) => {
      void rebaseHierarchy(id, true);
    },
    [rebaseHierarchy],
  );
  const resetRoot = useCallback(() => {
    void rebaseHierarchy(null, true);
  }, [rebaseHierarchy]);
  const retry = useCallback(() => {
    if (retryRootRef.current !== undefined) {
      void rebaseHierarchy(retryRootRef.current, true);
      return;
    }
    refreshPanel();
  }, [refreshPanel, rebaseHierarchy]);

  const selectSearchResult = useCallback(
    (id: string) => {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchItems([]);
      setSearchCompleted(false);
      openRoot(id);
    },
    [openRoot],
  );

  const viewingOtherRoot = Boolean(tree && selfAccountId && tree.root !== selfAccountId);
  const rootUsername = tree?.nodes.find((node) => node.id === tree.root)?.username;

  return (
    <section className="grid gap-4" aria-labelledby="hierarchy-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Network</p>
          <h2 id="hierarchy-heading" className="text-2xl font-semibold tracking-tight">
            Your referral network
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Explore people in your referral network. Financial information about other accounts is
            never shown here.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={refreshPanel}
          disabled={loading || hierarchyLoading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <div className="grid gap-2 sm:max-w-md" ref={searchContainerRef}>
        <label htmlFor="hierarchy-search" className="text-sm font-medium text-slate-700">
          Search your network by username
        </label>
        <div className="relative">
          <Input
            id="hierarchy-search"
            type="search"
            maxLength={100}
            role="combobox"
            aria-autocomplete="list"
            aria-busy={searchLoading}
            aria-expanded={searchOpen && searchQuery.trim().length >= 2}
            aria-controls="hierarchy-search-results"
            aria-activedescendant={
              activeSearchIndex >= 0 ? `hierarchy-search-option-${activeSearchIndex}` : undefined
            }
            placeholder="Search your network by username"
            value={searchQuery}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) setSearchOpen(true);
            }}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(event.target.value.trim().length >= 2);
              setSearchItems([]);
              setSearchCompleted(false);
              setSearchError(null);
              setSearchLoading(false);
              setActiveSearchIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                return;
              }
              if (!searchOpen || searchItems.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveSearchIndex((index) =>
                  moveHierarchySearchSelection(index, 1, searchItems.length),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveSearchIndex((index) =>
                  moveHierarchySearchSelection(index, -1, searchItems.length),
                );
              } else if (event.key === "Enter" && activeSearchIndex >= 0) {
                event.preventDefault();
                const item = searchItems[activeSearchIndex];
                if (item) selectSearchResult(item.id);
              }
            }}
          />
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div
              id="hierarchy-search-results"
              role="listbox"
              aria-label="Network search results"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              {searchLoading && (
                <p className="px-3 py-2 text-sm text-slate-500" role="status">
                  Searching…
                </p>
              )}
              {!searchLoading && searchCompleted && searchItems.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-500">No user found in your network</p>
              )}
              {searchItems.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  id={`hierarchy-search-option-${index}`}
                  aria-selected={activeSearchIndex === index}
                  key={item.id}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                    activeSearchIndex === index ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSearchIndex(index)}
                  onClick={() => selectSearchResult(item.id)}
                >
                  <span className="text-sm font-medium text-slate-900">{item.username}</span>
                  {item.displayName && (
                    <span className="text-xs text-slate-500">{item.displayName}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {searchError && (
          <p className="text-sm text-red-700" role="alert">
            {searchError}
          </p>
        )}
      </div>
      {viewingOtherRoot && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>
            Viewing tree from:{" "}
            <strong className="font-semibold text-slate-900">{rootUsername}</strong>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={resetRoot}>
            Back to my network
          </Button>
        </div>
      )}
      {error && (
        <Toast>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </Toast>
      )}
      {loading ? (
        <div className="grid gap-4" aria-label="Loading network">
          <Skeleton className="h-[520px] w-full" />
        </div>
      ) : tree && selfAccountId ? (
        <>
          <HierarchyGraph
            tree={tree}
            selfAccountId={selfAccountId}
            onViewBranch={openRoot}
            onLoadChildren={(id) => void loadMoreChildren(id)}
            loadingChildren={loadingChildren}
            onResetRoot={resetRoot}
          />
          {hierarchyLoading && (
            <p className="text-sm text-slate-500" role="status" aria-live="polite">
              Loading branch…
            </p>
          )}
        </>
      ) : (
        <EmptyState title="Network unavailable" description="Try refreshing the network." />
      )}
    </section>
  );
}
