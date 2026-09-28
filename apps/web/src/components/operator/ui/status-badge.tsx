import { Badge } from "../../ui/badge";

export type OperatorStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const statusTones: Record<string, OperatorStatusTone> = {
  active: "success",
  available: "success",
  approved: "success",
  completed: "success",
  confirmed: "success",
  succeeded: "success",
  processed: "success",
  paid: "success",
  published: "success",
  awaiting_payment: "warning",
  draft: "warning",
  pending: "warning",
  requested: "warning",
  verification_pending: "warning",
  archived: "neutral",
  cancelled: "danger",
  expired: "danger",
  failed: "danger",
  rejected: "danger",
  reversed: "neutral",
  credit: "success",
  debit: "neutral",
  blocked: "danger",
  processing: "info",
  queued: "info",
  submitted: "info",
};

const badgeVariants = {
  neutral: "secondary",
  success: "default",
  warning: "warning",
  danger: "destructive",
  info: "info",
} as const;

export function operatorStatusTone(status: string): OperatorStatusTone {
  const normalized = status.trim().toLowerCase().replaceAll("-", "_");
  return Object.hasOwn(statusTones, normalized) ? statusTones[normalized] : "neutral";
}

export function OperatorStatusBadge({
  status,
  label = status,
  tone,
}: {
  status: string;
  label?: string;
  tone?: OperatorStatusTone;
}) {
  return (
    <Badge
      variant={badgeVariants[tone ?? operatorStatusTone(status)]}
      className="rounded-md px-2 py-0.5"
    >
      {label}
    </Badge>
  );
}
