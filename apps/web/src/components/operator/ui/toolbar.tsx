import type { FormHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OperatorToolbar({
  children,
  actions,
  className,
  ...formProps
}: Omit<FormHTMLAttributes<HTMLFormElement>, "className" | "children"> & {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <form
      aria-label={formProps["aria-label"] ?? "Operator filters"}
      {...formProps}
      className={cn(
        "grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-end",
        className,
      )}
    >
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </form>
  );
}

export function OperatorFilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-end gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
