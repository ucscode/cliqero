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
import { Skeleton } from "../ui/skeleton";
import { HierarchyGraph } from "./graph";
import { mergeHierarchyChildren } from "./graph/model";
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
  const hierarchyLoadingRef = useRef(false);
  const retryRootRef = useRef<string | null | undefined>(undefined);
  const lastSuccessfulUrlRef = useRef<string | null>(null);

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

  return (
    <section className="grid gap-4" aria-labelledby="hierarchy-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Hierarchy</p>
          <h2 id="hierarchy-heading" className="text-2xl font-semibold tracking-tight">
            Your referral hierarchy
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Explore your authorized account hierarchy visually. Financial information for other
            accounts is never shown here.
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
      {error && (
        <Toast>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </Toast>
      )}
      {loading ? (
        <div className="grid gap-4" aria-label="Loading hierarchy">
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
        <EmptyState title="Hierarchy unavailable" description="Try refreshing your hierarchy." />
      )}
    </section>
  );
}
