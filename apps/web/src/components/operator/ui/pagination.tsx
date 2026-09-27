import type { ReactNode } from "react";
import { Button } from "../../ui/button";

export function OperatorPagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  summary,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  summary?: ReactNode;
}) {
  return (
    <nav
      aria-label="Operator result pages"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-slate-600">{summary}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={onNext}>
          Next
        </Button>
      </div>
    </nav>
  );
}
