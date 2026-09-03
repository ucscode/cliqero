import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-emerald-700 text-white",
        secondary: "border-transparent bg-slate-100 text-slate-800",
        outline: "text-slate-700",
        destructive: "border-transparent bg-red-700 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  /** @deprecated Prefer the shadcn `variant`; retained for unmigrated semantics. */
  tone?: "neutral" | "accent" | "success";
}
function Badge({ className, variant, tone, ...props }: BadgeProps) {
  const resolved =
    variant ?? (tone === "success" ? "default" : tone === "accent" ? "destructive" : "secondary");
  return <div className={cn(badgeVariants({ variant: resolved }), className)} {...props} />;
}
export { Badge, badgeVariants };
