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
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-red-800"
          : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3",
        className,
      )}
    >
      <div>
        {!inline && <p className="text-sm font-semibold text-red-900">{title}</p>}
        <p className={cn("text-sm", !inline && "mt-0.5 text-red-800")}>{message}</p>
      </div>
      {retry && (
        <Button
          variant="outline"
          size="sm"
          className="border-red-300 text-red-800 hover:bg-red-100"
          onClick={retry}
          type="button"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
