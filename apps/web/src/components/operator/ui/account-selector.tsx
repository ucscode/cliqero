"use client";

import AsyncSelect from "react-select/async";
import { apiFetch, type OperatorAccountPage, type OperatorAccountSummary } from "@/lib/api-client";

const styles = {
  control: (base: object) => ({ ...base, minHeight: 42 }),
  menuPortal: (base: object) => ({ ...base, zIndex: 80 }),
};

type Option = { value: string; label: string; account: OperatorAccountSummary };

export function OperatorAccountSelector({
  value,
  onChange,
  endpoint = "/api/accounts",
  excludedAccountId,
  inputId,
  placeholder = "Search by username, email, or name",
  required = false,
  isDisabled = false,
  loadAccounts,
}: {
  value: OperatorAccountSummary | null;
  onChange: (account: OperatorAccountSummary | null) => void;
  endpoint?: string;
  excludedAccountId?: string;
  inputId: string;
  placeholder?: string;
  required?: boolean;
  isDisabled?: boolean;
  loadAccounts?: (query: string) => Promise<OperatorAccountSummary[]>;
}) {
  async function loadOptions(query: string): Promise<Option[]> {
    if (!query.trim()) return [];
    const separator = endpoint.includes("?") ? "&" : "?";
    const accounts = loadAccounts
      ? await loadAccounts(query.trim())
      : (
          await apiFetch<OperatorAccountPage>(
            `${endpoint}${separator}search=${encodeURIComponent(query.trim())}&limit=10`,
          )
        ).items;
    return accounts
      .filter((account) => account.id !== excludedAccountId)
      .map((account) => ({
        value: account.id,
        label: `@${account.username} · ${account.displayName || account.email || account.id}`,
        account,
      }));
  }

  const selected: Option | null = value
    ? {
        value: value.id,
        label: `@${value.username} · ${value.displayName || value.email || value.id}`,
        account: value,
      }
    : null;

  return (
    <AsyncSelect<Option, false>
      inputId={inputId}
      instanceId={inputId}
      cacheOptions
      defaultOptions={false}
      loadOptions={loadOptions}
      value={selected}
      onChange={(option) => onChange(option?.account ?? null)}
      placeholder={placeholder}
      noOptionsMessage={() => "Search for an account"}
      styles={styles}
      menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
      aria-label="Account"
      required={required}
      isDisabled={isDisabled}
    />
  );
}
