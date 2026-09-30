"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiClientError,
  apiFetch,
  type HierarchyChildren,
  type HierarchyTree,
} from "@/lib/api-client";
import { EmptyState } from "../empty-state";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { HierarchyGraph } from "./graph";
import { mergeHierarchyChildren } from "./graph/model";
import { HierarchyUsernameSearch } from "./search";
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
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const hierarchyLoadingRef = useRef(false);
  const retryRootRef = useRef<string | null | undefined>(undefined);
  const lastSuccessfulUrlRef = useRef<string | null>(null);
  const searchClientRef = useRef<HierarchyUsernameSearch | null>(null);
  if (searchClientRef.current == null) {
    searchClientRef.current = new HierarchyUsernameSearch((path) =>
      apiFetch<{ items: Array<{ id: string; username: string; displayName: string | null }> }>(
        path,
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

  const refreshPanel = useCallback(() => {
    void loadPanel(hierarchyRootFromUrl(window.location.href));
  }, [loadPanel]);

  const rebaseHierarchy = useCallback(async (rootId: string | null, updateHistory: boolean) => {
    if (hierarchyLoadingRef.current) return false;
    const previousUrl = lastSuccessfulUrlRef.current ?? window.location.href;
    hierarchyLoadingRef.current = true;
    retryRootRef.current = rootId;
    setError(null);
    const loaded = await runHierarchyRebase(() => fetchHierarchyTree(rootId, apiFetch), {
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
    return loaded;
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

  const submitUsernameSearch = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const username = searchQuery.trim();
      if (!username) {
        setSearchMessage("Enter a username to search.");
        return;
      }
      if (searchLoading || hierarchyLoadingRef.current) return;

      setSearchLoading(true);
      setSearchMessage(null);
      try {
        const match = await searchClientRef.current!.find(username);
        if (!match) {
          setSearchMessage("User not found in your network.");
          return;
        }
        if (await rebaseHierarchy(match.id, true)) setSearchQuery("");
      } catch {
        setSearchMessage("We couldn’t search your network. Please try again.");
      } finally {
        setSearchLoading(false);
      }
    },
    [rebaseHierarchy, searchLoading, searchQuery],
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
      <form className="grid gap-2 sm:max-w-md" onSubmit={submitUsernameSearch}>
        <label htmlFor="hierarchy-search" className="text-sm font-medium text-slate-700">
          Search your network by username
        </label>
        <div className="flex items-start gap-2">
          <Input
            id="hierarchy-search"
            type="search"
            maxLength={100}
            required
            aria-busy={searchLoading}
            placeholder="Search your network by username"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchMessage(null);
            }}
          />
          <Button type="submit" disabled={searchLoading || hierarchyLoading}>
            {searchLoading ? "Searching…" : "Search"}
          </Button>
        </div>
        {searchMessage && (
          <p className="text-sm text-red-700" role="status" aria-live="polite">
            {searchMessage}
          </p>
        )}
      </form>
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
        <Alert>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </Alert>
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
