import type { ReactNode } from "react";
import { CircleDashed } from "lucide-react";

export function OperatorEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"
    >
      <CircleDashed className="mx-auto mb-3 h-6 w-6 text-slate-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-xl text-sm leading-5 text-slate-600">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
