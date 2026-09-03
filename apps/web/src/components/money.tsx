import { formatMinorUsd } from "@/lib/api-client";

/** Cliqero-specific display for canonical integer minor-unit amounts. */
export function Money({ minor, currency = "USD" }: { minor: string | bigint; currency?: string }) {
  return (
    <span className="font-semibold tracking-tight">
      {currency === "USD" ? formatMinorUsd(minor) : `${currency} ${minor}`}
    </span>
  );
}
