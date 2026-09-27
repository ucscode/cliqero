import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OperatorStatusBadge } from "./status-badge";

export function OperatorPrimaryCell({
  title,
  subtitle,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-0.5", className)}>
      <span className="break-words text-sm font-medium text-slate-900">{title}</span>
      {subtitle && <span className="break-words text-sm text-slate-500">{subtitle}</span>}
    </div>
  );
}

export function OperatorSecondaryText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("text-sm text-slate-600", className)}>{children}</span>;
}

export function OperatorValueCell({
  children,
  align = "right",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block whitespace-nowrap text-sm font-medium tabular-nums text-slate-800",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OperatorStatusCell({ status, label }: { status: string; label?: string }) {
  return <OperatorStatusBadge status={status} label={label} />;
}

export function OperatorActionCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex items-center justify-end gap-2", className)}>{children}</div>;
}
