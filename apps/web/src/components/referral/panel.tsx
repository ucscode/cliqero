"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type HierarchyDescendant,
  type HierarchyDescendantPage,
  type HierarchyLevels,
} from "@/lib/api-client";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

const PAGE_SIZE = 25;

function identityLabel(identity: { displayName: string | null; username: string }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <strong className="truncate">{identity.displayName || identity.username}</strong>
      <small className="truncate text-xs text-slate-500">@{identity.username}</small>
    </span>
  );
}

export function ReferralsPanel() {
  const [availableLevels, setAvailableLevels] = useState<number[]>([]);
  const [level, setLevel] = useState<number | null>(null);
  const [items, setItems] = useState<HierarchyDescendant[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levelsRequestIdRef = useRef(0);
  const pageRequestIdRef = useRef(0);

  const loadLevels = useCallback(async () => {
    const requestId = ++levelsRequestIdRef.current;
    setLevelsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<HierarchyLevels>("/api/hierarchy/levels");
      if (requestId !== levelsRequestIdRef.current) return;
      setAvailableLevels(result.levels);
      setLevel((current) =>
        current !== null && result.levels.includes(current) ? current : (result.levels[0] ?? null),
      );
    } catch (cause) {
      if (requestId !== levelsRequestIdRef.current) return;
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load your referrals.",
      );
      setAvailableLevels([]);
      setLevel(null);
    } finally {
      if (requestId === levelsRequestIdRef.current) setLevelsLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (selectedLevel: number, cursor: string | null) => {
    const requestId = ++pageRequestIdRef.current;
    const appending = cursor !== null;
    if (appending) setLoadingMore(true);
    else {
      setLoading(true);
      setItems([]);
      setNextCursor(null);
    }
    setError(null);
    try {
      const query = new URLSearchParams({
        level: String(selectedLevel),
        limit: String(PAGE_SIZE),
      });
      if (cursor) query.set("cursor", cursor);
      const page = await apiFetch<HierarchyDescendantPage>(
        `/api/hierarchy/descendants?${query.toString()}`,
      );
      if (requestId !== pageRequestIdRef.current) return;
      setItems((current) => (appending ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (requestId !== pageRequestIdRef.current) return;
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load your referrals.",
      );
    } finally {
      if (requestId !== pageRequestIdRef.current) return;
      if (appending) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadLevels());
  }, [loadLevels]);

  useEffect(() => {
    if (level === null) return;
    // Changing level starts a fresh exact-level traversal and resets the cursor.
    void Promise.resolve().then(() => loadPage(level, null));
  }, [level, loadPage]);

  const retry = useCallback(() => {
    if (level === null) void loadLevels();
    else void loadPage(level, null);
  }, [level, loadLevels, loadPage]);

  return (
    <section className="grid gap-4" aria-labelledby="referrals-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Referrals</p>
          <h2 id="referrals-heading">Your referrals</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Browse the accounts in your referral network by level. Downlines shows each account’s
            direct children.
          </p>
        </div>
        {availableLevels.length > 0 && (
          <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="referral-level">
            Level
            <select
              id="referral-level"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={level ?? ""}
              onChange={(event) => setLevel(Number(event.target.value))}
            >
              {availableLevels.map((option) => (
                <option key={option} value={option}>
                  {`Level ${option}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <Toast>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </Toast>
      )}
      {levelsLoading || (level !== null && loading) ? (
        <Card className="p-5" aria-label="Loading referrals">
          <Skeleton className="h-48 w-full" />
        </Card>
      ) : availableLevels.length === 0 ? (
        <EmptyState
          title="No referrals yet"
          description="Accounts in your referral network will appear here."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No referrals at these levels"
          description="Accounts in your referral network will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold" scope="col">
                    Level
                  </th>
                  <th className="px-5 py-3 font-semibold" scope="col">
                    Name
                  </th>
                  <th className="px-5 py-3 font-semibold" scope="col">
                    Downlines
                  </th>
                  <th className="px-5 py-3 font-semibold" scope="col">
                    Upline
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 align-top font-medium text-slate-700">{item.level}</td>
                    <td className="px-5 py-4 align-top">{identityLabel(item)}</td>
                    <td className="px-5 py-4 align-top text-slate-700">{item.directChildCount}</td>
                    <td className="px-5 py-4 align-top">
                      {item.upline ? identityLabel(item.upline) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="border-t border-slate-200 p-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadPage(level!, nextCursor)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more referrals"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
