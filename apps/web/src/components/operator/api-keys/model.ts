import type { ApiKeyMetadata } from "@/lib/api-client";
import type { OperatorAction } from "../ui/actions-menu";

export type OperatorApiKeyRow = ApiKeyMetadata & {
  account_id: string;
  account_username: string;
  account_email: string | null;
  state: "active" | "expired" | "revoked";
};

export type ApiKeyCollectionFilters = {
  search: string;
  accountId: string | null;
  state: "all" | "active" | "expired" | "revoked";
  sort: "created" | "name" | "expires";
  direction: "asc" | "desc";
};

export const INITIAL_API_KEY_FILTERS: ApiKeyCollectionFilters = {
  search: "",
  accountId: null,
  state: "all",
  sort: "created",
  direction: "desc",
};

export function apiKeyCollectionQuery(
  filters: ApiKeyCollectionFilters,
  cursor: string | null,
  limit: number,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    state: filters.state,
    sort: filters.sort,
    direction: filters.direction,
  });
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.accountId) params.set("account_id", filters.accountId);
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function apiKeyFiltersEqual(left: ApiKeyCollectionFilters, right: ApiKeyCollectionFilters) {
  return (
    left.search.trim() === right.search.trim() &&
    left.accountId === right.accountId &&
    left.state === right.state &&
    left.sort === right.sort &&
    left.direction === right.direction
  );
}

export function toggleApiKeyScope(scopes: readonly string[], scope: string, checked: boolean) {
  const selected = new Set(scopes);
  if (checked) selected.add(scope);
  else selected.delete(scope);
  return [...selected];
}

export function operatorApiKeyRowActions(
  key: OperatorApiKeyRow,
  onDelete: (key: OperatorApiKeyRow) => void,
): readonly OperatorAction[] {
  return [
    { type: "link", label: "Edit API key", href: `/operator/api-keys/${key.id}` },
    {
      type: "action",
      label: "Permanently delete API key",
      destructive: true,
      onSelect: () => onDelete(key),
    },
  ];
}
