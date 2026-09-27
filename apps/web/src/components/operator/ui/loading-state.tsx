import { Card } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { OperatorTableSurface } from "./table-surface";

export type OperatorLoadingVariant = "section" | "toolbar" | "table";

export function OperatorLoadingState({
  variant = "section",
  rows = 4,
  columns = 4,
  label = "Loading operator data",
}: {
  variant?: OperatorLoadingVariant;
  rows?: number;
  columns?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      {variant === "toolbar" ? (
        <Card aria-hidden="true" className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: columns }, (_, index) => (
            <div className="grid gap-2" key={index}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-24 sm:col-span-2 xl:col-span-4 xl:justify-self-end" />
        </Card>
      ) : variant === "table" ? (
        <OperatorTableSurface>
          <Table aria-hidden="true">
            <TableHeader>
              <TableRow>
                {Array.from({ length: columns }, (_, index) => (
                  <TableHead key={index}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rows }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: columns }, (_, column) => (
                    <TableCell key={column}>
                      <Skeleton className={column === 0 ? "h-4 w-40" : "h-4 w-24"} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OperatorTableSurface>
      ) : (
        <Card aria-hidden="true" className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-24 w-full" />
        </Card>
      )}
    </div>
  );
}
