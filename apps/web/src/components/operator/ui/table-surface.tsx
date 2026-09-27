import type { ReactNode } from "react";
import { Card } from "../../ui/card";
import { cn } from "@/lib/utils";

export function OperatorTableSurface({
  children,
  header,
  footer,
  className,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      {header && <div className="border-b border-slate-200 px-4 py-3 sm:px-5">{header}</div>}
      <div className="min-w-0 overflow-x-auto">{children}</div>
      {footer && <div className="border-t border-slate-200 px-4 py-3 sm:px-5">{footer}</div>}
    </Card>
  );
}
