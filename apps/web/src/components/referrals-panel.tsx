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
import { Badge, Button, Card, EmptyState, Skeleton, Toast } from "./ui";
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
    <section className="referral-panel" aria-labelledby="referrals-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Referrals</p>
          <h2 id="referrals-heading">Your referral network</h2>
          <p className="panel-intro">
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
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </Toast>
      )}
      {loading ? (
        <div className="referral-grid" aria-label="Loading referrals">
          <Skeleton className="referral-skeleton" />
          <Skeleton className="referral-skeleton" />
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
          <div className="referral-grid">
            <Card className="referral-section-card">
              <div className="card-kicker">
                <h3>Direct referrals</h3>
                <Badge tone="accent">{direct?.accounts.length ?? 0}</Badge>
              </div>
              {direct?.accounts.length ? (
                <ul className="identity-list">
                  {direct.accounts.map((id) => {
                    const node = nodesById.get(id);
                    return (
                      <li key={id}>
                        <span className="identity-avatar">
                          {(node?.handle ?? id).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{node?.displayName || node?.handle || "Cliqero account"}</strong>
                          <small>{node?.handle ?? id}</small>
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

            <Card className="referral-section-card">
              <div className="card-kicker">
                <h3>Upline context</h3>
                <Badge>{uplines?.uplines.length ?? 0}</Badge>
              </div>
              {uplines?.uplines.length ? (
                <ol className="identity-list">
                  {uplines.uplines.map((upline) => {
                    const node = nodesById.get(upline.accountId);
                    return (
                      <li key={upline.accountId}>
                        <span className="identity-avatar">
                          {(node?.handle ?? upline.accountId).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{node?.displayName || node?.handle || "Cliqero account"}</strong>
                          <small>Level {upline.depth}</small>
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

            <Card className="referral-section-card referral-downline-card">
              <div className="card-kicker">
                <h3>Network context</h3>
                <Badge tone="accent">{tree.windowDepth} levels</Badge>
              </div>
              <p className="panel-note">
                The graph is bounded to {tree.windowDepth} generations and {tree.childLimit}{" "}
                children per branch at a time. Use View branch to explore deeper generations.
              </p>
              {generations.length ? (
                <div className="generation-list">
                  {generations.map(([depth, nodes]) => (
                    <div className="generation" key={depth}>
                      <div className="generation-heading">
                        <strong>Generation {depth}</strong>
                        <span>{nodes.length} shown</span>
                      </div>
                      <ul className="identity-list">
                        {nodes.map((node) => (
                          <li key={node.id}>
                            <span className="identity-avatar">
                              {node.handle.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{node.displayName || node.handle}</strong>
                              <small>{node.handle}</small>
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
