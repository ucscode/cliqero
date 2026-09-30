import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-emerald-700 !text-white hover:bg-emerald-800 focus-visible:ring-emerald-600",
        action: "bg-sky-700 !text-white hover:bg-sky-800 focus-visible:ring-sky-600",
        secondary:
          "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-500",
        outline:
          "border border-slate-300 bg-transparent hover:bg-slate-50 focus-visible:ring-slate-500",
        ghost: "hover:bg-slate-100 focus-visible:ring-slate-500",
        destructive: "bg-rose-800 !text-white hover:bg-rose-900 focus-visible:ring-rose-700",
      },
      size: {
        default: "px-5 py-2.5",
        xs: "rounded-md px-2.5 py-1.5 text-xs leading-4",
        sm: "rounded-md px-3.5 py-2 text-sm leading-5",
        lg: "px-7 py-3 text-base leading-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
