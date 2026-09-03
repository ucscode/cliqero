import { cn } from "@/lib/utils";
function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn("rounded-md border border-slate-200 bg-slate-50 p-3 text-sm", className)}
      {...props}
    />
  );
}
export { Alert };
