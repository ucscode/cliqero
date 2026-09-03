import { CircleDashed } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center">
      <CircleDashed className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" />
      <h3 className="mb-2 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto max-w-[420px] text-sm text-slate-500">{description}</p>
    </div>
  );
}
