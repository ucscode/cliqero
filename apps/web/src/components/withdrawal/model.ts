import type { WithdrawalState } from "@/lib/api/withdrawal";

export type WithdrawalBadgeVariant = "warning" | "info" | "default" | "destructive" | "secondary";

export function parseWithdrawalAmount(value: string, currency: string): string {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized))
    throw new Error(`Enter a ${currency} amount with no more than two decimal places.`);
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (minor <= 0n) throw new Error("Enter an amount greater than zero.");
  return minor.toString();
}

export function withdrawalBadgeVariant(state: WithdrawalState): WithdrawalBadgeVariant {
  switch (state) {
    case "requested":
      return "warning";
    case "approved":
      return "info";
    case "completed":
      return "default";
    case "rejected":
    case "failed":
      return "destructive";
    case "cancelled":
      return "secondary";
  }
}

export function withdrawalRequestErrorField(message: string): "amount" | "destination" | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("amount") ||
    normalized.includes("minimum") ||
    normalized.includes("maximum") ||
    normalized.includes("available funds") ||
    normalized.includes("available earnings") ||
    normalized.includes("currency")
  )
    return "amount";
  if (normalized.includes("destination") || normalized.includes("payout method"))
    return "destination";
  return null;
}
