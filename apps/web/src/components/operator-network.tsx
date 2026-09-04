"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type HierarchyChildren,
  type HierarchyTree,
  type OperatorAccountPage,
} from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { HoneypotField } from "./honeypot-field";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { HierarchyGraph } from "./hierarchy-graph";
import { mergeHierarchyChildren } from "./hierarchy-graph-model";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The hierarchy service is temporarily unavailable.";
}

export function OperatorNetwork() {
  const router = useRouter();
  const params = useSearchParams();
  const rootParam = params.get("root");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [tree, setTree] = useState<HierarchyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChildren, setLoadingChildren] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<OperatorAccountPage["items"]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profile, hierarchy] = await Promise.all([
        apiFetch<{ id: string }>("/api/me/profile"),
        apiFetch<HierarchyTree>(
          rootParam
            ? `/api/hierarchy/tree?root=${encodeURIComponent(rootParam)}`
            : "/api/hierarchy/tree",
        ),
      ]);
      setSelfId(profile.id);
      setTree(hierarchy);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError && cause.status === 403
          ? "This account or branch is not available to your operator role."
          : errorMessage(cause),
      );
    } finally {
      setLoading(false);
    }
  }, [rootParam]);

  useEffect(() => {
    // Initial loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function searchAccounts() {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    try {
      const page = await apiFetch<OperatorAccountPage>(
        `/api/operator/accounts?search=${encodeURIComponent(search.trim())}&limit=10`,
      );
      setResults(page.items);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const openRoot = (id: string) => router.push(`/operator/network?root=${encodeURIComponent(id)}`);
  const loadMore = async (parentId: string) => {
    if (!tree || loadingChildren) return;
    const parent = tree.nodes.find((node) => node.id === parentId);
    if (!parent?.hasMoreChildren || !parent.nextChildCursor) return;
    setLoadingChildren(parentId);
    try {
      const page = await apiFetch<HierarchyChildren>(
        `/api/hierarchy/children/${parentId}?cursor=${encodeURIComponent(parent.nextChildCursor)}`,
      );
      setTree((current) => (current ? mergeHierarchyChildren(current, page) : current));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingChildren(null);
    }
  };

  if (loading)
    return (
      <Card aria-label="Loading network">
        <Skeleton className="hierarchy-skeleton" />
      </Card>
    );
  if (!tree || !selfId)
    return (
      <Card>
        <EmptyState
          title="Network unavailable"
          description={error || "Try refreshing the network."}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  return (
    <div className="operator-network-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Network operations</p>
          <h2 id="operator-network-heading">Referral network</h2>
          <p className="panel-intro">
            Inspect any account branch in bounded windows. Relationships change only through
            explicit reassignment.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error && <Toast>{error}</Toast>}
      <Card className="operator-network-search">
        <form
          className="catalogue-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void searchAccounts();
          }}
        >
          <HoneypotField />
          <label>
            Find an account
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Handle, email, or account ID"
            />
          </label>
          <Button type="submit" variant="secondary">
            Search network
          </Button>
        </form>
        {results.length > 0 && (
          <ul className="operator-search-results">
            {results.map((result) => (
              <li key={result.id}>
                <button type="button" onClick={() => openRoot(result.id)}>
                  <strong>@{result.handle}</strong>
                  <span>{result.displayName || result.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <HierarchyGraph
        tree={tree}
        selfAccountId={selfId}
        operatorMode
        onViewBranch={openRoot}
        onLoadChildren={(id) => void loadMore(id)}
        loadingChildren={loadingChildren}
        onNavigateParent={() => {
          if (tree.parent) openRoot(tree.parent.id);
        }}
        onResetRoot={() => router.push("/operator/network")}
        onViewUser={(id) => router.push(`/operator/users/${id}`)}
        onReassignParent={(id) => router.push(`/operator/users/${id}`)}
      />
    </div>
  );
}
