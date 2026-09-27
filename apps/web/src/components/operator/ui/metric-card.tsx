import type { ReactNode } from "react";
import { Card } from "../../ui/card";

export function OperatorMetricCard({
  label,
  value,
  category,
  detail,
}: {
  label: string;
  value: ReactNode;
  category?: string;
  detail?: ReactNode;
}) {
  return (
    <Card className="min-w-0 border-slate-200 p-4 shadow-none">
      {category && (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{category}</p>
      )}
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{label}</p>
      {detail && <div className="mt-1 text-sm text-slate-500">{detail}</div>}
    </Card>
  );
}
