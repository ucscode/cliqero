import { useId } from "react";

export type OperatorBulkFailure = {
  id: string;
  label?: string;
  message: string;
};

export type OperatorBulkOutcomeData = {
  resource: string;
  selectedCount: number;
  failures: readonly OperatorBulkFailure[];
};

export function groupBulkFailureReasons(failures: readonly OperatorBulkFailure[]) {
  const groups = new Map<string, number>();
  for (const failure of failures)
    groups.set(failure.message, (groups.get(failure.message) ?? 0) + 1);
  return [...groups].map(([message, count]) => ({ message, count }));
}

export function OperatorBulkOutcome({ outcome }: { outcome: OperatorBulkOutcomeData }) {
  const headingId = useId();
  if (outcome.failures.length === 0) return null;

  const reasons = groupBulkFailureReasons(outcome.failures);
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-950 sm:px-5"
      role="alert"
    >
      <div>
        <h3 id={headingId} className="text-sm font-semibold">
          Some selected items could not be processed
        </h3>
        <p className="mt-1 text-sm text-rose-900">
          {outcome.failures.length} of {outcome.selectedCount} selected {outcome.resource} failed.
        </p>
      </div>
      <ul className="max-h-28 space-y-1 overflow-y-auto text-sm text-rose-900">
        {reasons.map(({ message, count }) => (
          <li key={message}>
            {count > 1 && <span className="font-semibold">{count} — </span>}
            {message}
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
          View individual failures ({outcome.failures.length})
        </summary>
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-rose-200 bg-white/70 p-3 text-rose-900">
          {outcome.failures.map((failure) => (
            <li key={failure.id} className="break-words">
              <span className="font-medium">{failure.label ?? failure.id}</span>
              <span>: {failure.message}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
