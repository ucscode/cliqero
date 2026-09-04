import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Cliqero's textual link treatment; navigation controls keep their own button styling. */
export function TextLink({
  className,
  ...props
}: LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link
      className={cn(
        "font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900 hover:decoration-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700",
        className,
      )}
      {...props}
    />
  );
}
