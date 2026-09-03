/**
 * Compatibility barrel for feature screens that have not yet migrated.
 * Generic presentation is implemented by the shadcn-compatible primitives in
 * components/ui/*; this file preserves existing imports while larger feature
 * surfaces move in later milestones.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { formatMinorUsd } from "@/lib/api-client";
import { CircleDashed } from "lucide-react";
import { Alert } from "./ui/alert";
import { Badge as ShadcnBadge } from "./ui/badge";
import { Button as ShadcnButton } from "./ui/button";
import { Card as ShadcnCard } from "./ui/card";
import { Dialog as RadixDialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input as ShadcnInput } from "./ui/input";
import { Select as ShadcnSelect } from "./ui/select";
import { Skeleton as ShadcnSkeleton } from "./ui/skeleton";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <ShadcnButton
      variant={variant === "primary" ? "default" : variant === "danger" ? "destructive" : variant}
      className={className}
      {...props}
    />
  );
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <ShadcnInput className={className} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <ShadcnSelect className={className} {...props} />;
}
export function Card({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <ShadcnCard className={className} {...props}>
      {children}
    </ShadcnCard>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success";
}) {
  return (
    <ShadcnBadge
      variant={tone === "success" ? "default" : tone === "accent" ? "destructive" : "secondary"}
    >
      {children}
    </ShadcnBadge>
  );
}
export function Money({ minor, currency = "USD" }: { minor: string | bigint; currency?: string }) {
  return (
    <span className="money">
      {currency === "USD" ? formatMinorUsd(minor) : `${currency} ${minor}`}
    </span>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <ShadcnSkeleton className={className} />;
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-16 text-center">
      <CircleDashed className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" />
      <h3 className="mb-2 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto max-w-[420px] text-sm text-slate-500">{description}</p>
    </div>
  );
}
export function Toast({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <Alert
      className={
        tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
      }
    >
      {children}
    </Alert>
  );
}
export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <RadixDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </RadixDialog>
  );
}
