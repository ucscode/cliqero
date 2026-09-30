import { useId, type ReactNode } from "react";
import { Card } from "../../ui/card";
import { cn } from "@/lib/utils";

export function OperatorSection({
  title,
  description,
  actions,
  children,
  surface = false,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  surface?: boolean;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0 space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-base font-semibold text-slate-900">
            {title}
          </h3>
          {description && <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {surface ? (
        <Card className="overflow-hidden">
          <div className="p-4 sm:p-5">{children}</div>
        </Card>
      ) : (
        children
      )}
    </section>
  );
}
