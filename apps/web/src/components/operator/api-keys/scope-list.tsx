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
  const scopes = API_SCOPES;
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-900">Permissions</legend>
      <p className="mb-3 mt-1 text-xs text-slate-600">
        A key’s scopes never exceed the authority of its owning account.
      </p>
      <p role={loading ? "status" : undefined} className="mb-3 text-xs text-slate-500">
        {loading
          ? "Checking permissions for the selected account…"
          : accountSelected
            ? "Permissions unavailable to the selected account remain visible and disabled."
            : "Select an account to check which of these permissions it may receive."}
      </p>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {scopes.map((scope) => {
          const metadata = API_SCOPE_METADATA[scope];
          const available = accountSelected && !loading && availableScopes.includes(scope);
          return (
            <label
              key={scope}
              className={`flex items-start gap-3 py-3 ${available ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}
            >
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope)}
                disabled={!available}
                onChange={(event) => onChange(scope, event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              />
              <span className="grid min-w-0 gap-0.5">
                <strong className="text-sm text-slate-900">{metadata.label}</strong>
                <code className="break-all text-xs text-slate-600">{scope}</code>
                <span className="text-xs leading-5 text-slate-600">{metadata.description}</span>
                {!available && accountSelected && !loading && (
                  <span className="text-xs text-slate-500">Unavailable for selected account.</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
