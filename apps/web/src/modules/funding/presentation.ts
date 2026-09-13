import type { FundingState } from "./funding";

export type FundingPresentationTone = "neutral" | "info" | "warning" | "success" | "danger";

export const fundingStatePresentation: Record<
  FundingState,
  {
    label: string;
    tone: FundingPresentationTone;
  }
> = {
  initialization_pending: { label: "Preparing payment", tone: "info" },
  initializing: { label: "Preparing payment", tone: "info" },
  awaiting_payment: { label: "Awaiting payment", tone: "warning" },
  verification_pending: { label: "Verifying payment", tone: "info" },
  confirmed: { label: "Payment confirmed", tone: "success" },
  failed: { label: "Payment unsuccessful", tone: "danger" },
  blocked: { label: "Action needed", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  reconciliation_pending: { label: "Action needed", tone: "warning" },
};

export function presentFundingState(state: string) {
  return (
    fundingStatePresentation[state as FundingState] ?? {
      label: "Payment status unavailable",
      tone: "neutral" as const,
    }
  );
}

export function fundingToneClass(tone: FundingPresentationTone) {
  return {
    neutral: "border-slate-200 bg-slate-50 text-slate-800",
    info: "border-blue-200 bg-blue-50 text-blue-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    danger: "border-red-200 bg-red-50 text-red-950",
  }[tone];
}
