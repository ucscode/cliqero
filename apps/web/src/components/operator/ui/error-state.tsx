import { cn } from "@/lib/utils";
import { Button } from "../../ui/button";

export function OperatorErrorState({
  message,
  title = "Something went wrong",
  retry,
  retryLabel = "Try again",
  inline = false,
  className,
}: {
  message: string;
  title?: string;
  retry?: () => void;
  retryLabel?: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        inline
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-rose-900"
          : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 sm:px-5",
        className,
      )}
    >
      <div>
        {!inline && <p className="text-sm font-semibold text-rose-950">{title}</p>}
        <p className={cn("text-sm", !inline && "mt-0.5 text-rose-900")}>{message}</p>
      </div>
      {retry && (
        <Button
          variant="outline"
          size="xs"
          className="border-rose-300 text-rose-900 hover:bg-rose-100"
          onClick={retry}
          type="button"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
