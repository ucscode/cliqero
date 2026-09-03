"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type HierarchyChildren,
  type HierarchyNode,
  type HierarchyTree,
  type ReferralPage,
  type UplinePage,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { HierarchyGraph } from "./hierarchy-graph";
import { mergeHierarchyChildren } from "./hierarchy-graph-model";

export function ReferralsPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const rootParam = params.get("root");
  const [selfAccountId, setSelfAccountId] = useState<string | null>(null);
  const [direct, setDirect] = useState<ReferralPage | null>(null);
  const [tree, setTree] = useState<HierarchyTree | null>(null);
  const [uplines, setUplines] = useState<UplinePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreDirect, setLoadingMoreDirect] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const treePath = rootParam
        ? `/api/hierarchy/tree?root=${encodeURIComponent(rootParam)}`
        : "/api/hierarchy/tree";
      const [profile, directPage, hierarchy, uplinePage] = await Promise.all([
        apiFetch<{ id: string }>("/api/me/profile"),
        apiFetch<ReferralPage>("/api/referrals/direct?limit=50"),
        apiFetch<HierarchyTree>(treePath),
        apiFetch<UplinePage>("/api/referrals/uplines?max_depth=10"),
      ]);
      setSelfAccountId(profile.id);
      setDirect(directPage);
      setTree(hierarchy);
      setUplines(uplinePage);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load your referral network.",
      );
    } finally {
      setLoading(false);
    }
  }, [rootParam]);

  useEffect(() => {
    // Initial data loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadMoreDirect = useCallback(async () => {
    if (!direct?.nextCursor || loadingMoreDirect) return;
    setLoadingMoreDirect(true);
    try {
      const next = await apiFetch<ReferralPage>(
        `/api/referrals/direct?limit=50&after=${encodeURIComponent(direct.nextCursor)}`,
      );
      setDirect((current) =>
        current
          ? { accounts: [...current.accounts, ...next.accounts], nextCursor: next.nextCursor }
          : next,
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load more referrals.",
      );
    } finally {
      setLoadingMoreDirect(false);
    }
  }, [direct, loadingMoreDirect]);

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
            : "We couldn’t load more network members.",
        );
      } finally {
        setLoadingChildren(null);
      }
    },
    [loadingChildren, tree],
  );

  const openRoot = useCallback(
    (id: string) => {
      router.push(`/dashboard?section=referrals&root=${encodeURIComponent(id)}`);
    },
    [router],
  );
  const resetRoot = useCallback(() => {
    router.push("/dashboard?section=referrals");
  }, [router]);

  const nodesById = useMemo(
    () => new Map((tree?.nodes ?? []).map((node) => [node.id, node])),
    [tree],
  );
  const generations = useMemo(() => {
    const grouped = new Map<number, HierarchyNode[]>();
    for (const node of tree?.nodes ?? []) {
      if (node.depth === 0) continue;
      const current = grouped.get(node.depth) ?? [];
      current.push(node);
      grouped.set(node.depth, current);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [tree]);

  return (
    <section className="grid gap-4" aria-labelledby="referrals-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Referrals</p>
          <h2 id="referrals-heading">Your referral network</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Explore your authorized network visually. Financial information for other accounts is
            never shown here.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && (
        <Toast>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </Toast>
      )}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-label="Loading referrals">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : tree && selfAccountId ? (
        <>
          <HierarchyGraph
            tree={tree}
            selfAccountId={selfAccountId}
            onViewBranch={openRoot}
            onLoadChildren={(id) => void loadMoreChildren(id)}
            loadingChildren={loadingChildren}
            onNavigateParent={() => {
              if (tree.parent?.canNavigate) openRoot(tree.parent.id);
            }}
            onResetRoot={resetRoot}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3>Direct referrals</h3>
                <Badge variant="destructive">{direct?.accounts.length ?? 0}</Badge>
              </div>
              {direct?.accounts.length ? (
                <ul className="grid gap-2">
                  {direct.accounts.map((id) => {
                    const node = nodesById.get(id);
                    return (
                      <li
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3"
                        key={id}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800">
                          {(node?.handle ?? id).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="grid min-w-0 gap-1">
                          <strong>{node?.displayName || node?.handle || "Cliqero account"}</strong>
                          <small className="break-all text-xs text-slate-500">
                            {node?.handle ?? id}
                          </small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  title="No direct referrals"
                  description="People you introduce will appear here."
                />
              )}
              {direct?.nextCursor && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void loadMoreDirect()}
                  disabled={loadingMoreDirect}
                >
                  {loadingMoreDirect ? "Loading…" : "Load more referrals"}
                </Button>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3>Upline context</h3>
                <Badge>{uplines?.uplines.length ?? 0}</Badge>
              </div>
              {uplines?.uplines.length ? (
                <ol className="grid gap-2">
                  {uplines.uplines.map((upline) => {
                    const node = nodesById.get(upline.accountId);
                    return (
                      <li
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3"
                        key={upline.accountId}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800">
                          {(node?.handle ?? upline.accountId).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="grid min-w-0 gap-1">
                          <strong>{node?.displayName || node?.handle || "Cliqero account"}</strong>
                          <small className="text-xs text-slate-500">Level {upline.depth}</small>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  title="No upline yet"
                  description="Your direct upline context will appear here when available."
                />
              )}
            </Card>

            <Card className="p-5 md:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3>Network context</h3>
                <Badge variant="destructive">{tree.windowDepth} levels</Badge>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                The graph is bounded to {tree.windowDepth} generations and {tree.childLimit}{" "}
                children per branch at a time. Use View branch to explore deeper generations.
              </p>
              {generations.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {generations.map(([depth, nodes]) => (
                    <div className="grid gap-2" key={depth}>
                      <div className="flex justify-between gap-3 text-xs text-slate-500">
                        <strong>Generation {depth}</strong>
                        <span>{nodes.length} shown</span>
                      </div>
                      <ul className="grid gap-2">
                        {nodes.map((node) => (
                          <li
                            className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3"
                            key={node.id}
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-800">
                              {node.handle.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="grid min-w-0 gap-1">
                              <strong>{node.displayName || node.handle}</strong>
                              <small className="break-all text-xs text-slate-500">
                                {node.handle}
                              </small>
                            </span>
                            {node.hasMoreChildren && <Badge>More below</Badge>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No downline yet"
                  description="You are the root of your network. Descendant accounts will appear here as your network grows."
                />
              )}
            </Card>
          </div>
        </>
      ) : (
        <EmptyState
          title="Network unavailable"
          description="Try refreshing your referral network."
        />
      )}
    </section>
  );
}
