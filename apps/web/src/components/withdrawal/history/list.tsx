import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import type { Withdrawal } from "@/lib/api/withdrawal";
import { withdrawalBadgeVariant } from "../model";

const stateLabels: Record<Withdrawal["state"], string> = {
  requested: "Request received",
  approved: "Approved · payment required",
  completed: "Payment completed",
  rejected: "Withdrawal rejected",
  cancelled: "Withdrawal cancelled",
  failed: "Payment failed",
};

export function WithdrawalHistoryList({
  withdrawals,
  onCancel,
  emptyTitle = "No withdrawals yet",
  emptyDescription = "Your payout requests will appear here after you submit one.",
}: {
  withdrawals: readonly Withdrawal[];
  onCancel?: (withdrawal: Withdrawal) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!withdrawals.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid gap-2">
      {withdrawals.map((withdrawal) => (
        <div
          className="grid grid-cols-1 gap-3 border-b border-slate-200 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
          key={withdrawal.id}
        >
          <div className="grid min-w-0 gap-1">
            <strong>
              <Money minor={withdrawal.amount_minor} currency={withdrawal.currency} />
            </strong>
            <span className="break-words text-sm text-slate-500">
              {withdrawal.destination.method_name} · {withdrawal.destination.name}
            </span>
            <small className="text-xs text-slate-500">
              {new Date(withdrawal.created_at).toLocaleDateString()}
            </small>
          </div>
          <div className="grid justify-items-end gap-2">
            <Badge variant={withdrawalBadgeVariant(withdrawal.state)}>
              {stateLabels[withdrawal.state]}
            </Badge>
            {withdrawal.reason && (
              <span className="max-w-48 break-words text-right text-xs text-slate-500">
                {withdrawal.reason}
              </span>
            )}
            {withdrawal.state === "requested" && onCancel && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onCancel(withdrawal)}>
                Cancel request
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
