import type { ReactNode } from "react";

export type CrudField = { label: ReactNode; value: ReactNode; className?: string };

export function CrudFieldList({
  fields,
  layout = "grid",
}: {
  fields: readonly CrudField[];
  layout?: "grid" | "stacked";
}) {
  return (
    <dl className={`grid min-w-0 gap-x-6 gap-y-4 ${layout === "grid" ? "sm:grid-cols-2" : ""}`}>
      {fields.map((field, index) => (
        <div
          key={`${index}`}
          className="grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] sm:items-start"
        >
          <dt className="text-sm text-slate-500">{field.label}</dt>
          <dd
            className={`min-w-0 break-words text-sm font-medium text-slate-900 ${field.className ?? ""}`}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
