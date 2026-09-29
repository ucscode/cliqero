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
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { HierarchyGraph } from "../hierarchy/graph";
import { mergeHierarchyChildren } from "../hierarchy/graph/model";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorFilterField, OperatorToolbar } from "./ui/toolbar";

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
          ? "This account or branch is not available to your authorized view."
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
        `/api/accounts?search=${encodeURIComponent(search.trim())}&limit=10`,
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
      <OperatorPage>
        <OperatorPageHeader eyebrow="Network operations" title="Referral network" />
        <OperatorLoadingState variant="section" label="Loading referral network" />
      </OperatorPage>
    );
  if (!tree || !selfId)
    return (
      <OperatorPage>
        <OperatorPageHeader eyebrow="Network operations" title="Referral network" />
        <OperatorErrorState
          title="Network unavailable"
          message={error || "Try refreshing the network."}
          retry={() => void load()}
        />
      </OperatorPage>
    );
  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Network operations"
        title="Referral network"
        description="Inspect any account branch in bounded windows. Relationships change only through explicit reassignment."
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      {error && <OperatorErrorState message={error} />}
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void searchAccounts();
        }}
        actions={
          <Button type="submit" variant="action">
            Search
          </Button>
        }
      >
        <OperatorFilterField label="Find an account" htmlFor="operator-network-search">
          <Input
            id="operator-network-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Username, email, or account ID"
          />
        </OperatorFilterField>
      </OperatorToolbar>
      {results.length > 0 && (
        <ul className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
          {results.map((result) => (
            <li key={result.id}>
              <button
                className="w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                type="button"
                onClick={() => openRoot(result.id)}
              >
                <strong className="block">@{result.username}</strong>
                <span className="text-sm text-slate-600">{result.displayName || result.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <HierarchyGraph
        tree={tree}
        selfAccountId={selfId}
        operatorMode
        onViewBranch={openRoot}
        onLoadChildren={(id) => void loadMore(id)}
        loadingChildren={loadingChildren}
        onResetRoot={() => router.push("/operator/network")}
        onViewUser={(id) => router.push(`/operator/users/${id}`)}
        onReassignParent={(id) => router.push(`/operator/users/${id}`)}
      />
    </OperatorPage>
  );
}
