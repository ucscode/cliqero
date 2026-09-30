"use client";

import { API_SCOPES, API_SCOPE_METADATA } from "@/modules/identity/api/scopes";

export function ApiKeyScopeList({
  availableScopes,
  selectedScopes,
  loading,
  accountSelected,
  onChange,
}: {
  availableScopes: readonly string[];
  selectedScopes: readonly string[];
  loading: boolean;
  accountSelected: boolean;
  onChange: (scope: string, checked: boolean) => void;
}) {
  const scopes = API_SCOPES.filter((scope) => availableScopes.includes(scope));
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-900">Permissions</legend>
      <p className="mb-3 mt-1 text-xs text-slate-600">
        A key’s scopes never exceed the authority of its owning account.
      </p>
      {!accountSelected ? (
        <p className="text-sm text-slate-500">Select an account to see assignable permissions.</p>
      ) : loading ? (
        <p role="status" className="text-sm text-slate-500">
          Loading permissions…
        </p>
      ) : scopes.length === 0 ? (
        <p className="text-sm text-slate-500">No permissions are available for this account.</p>
      ) : (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {scopes.map((scope) => {
            const metadata = API_SCOPE_METADATA[scope];
            return (
              <label key={scope} className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={(event) => onChange(scope, event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                />
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-sm text-slate-900">{metadata.label}</strong>
                  <code className="break-all text-xs text-slate-600">{scope}</code>
                  <span className="text-xs leading-5 text-slate-600">{metadata.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
