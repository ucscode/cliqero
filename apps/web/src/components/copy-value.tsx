"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./ui/button";

export function copyValueButtonLabel(copied: boolean) {
  return copied ? "Copied" : "Copy";
}

export function copyValueActionLabel(label: string, copied: boolean) {
  return copied ? `${label} copied` : `Copy ${label}`;
}

export function CopyValue({
  label,
  value,
  displayValue = value,
}: {
  label: string;
  value: string;
  displayValue?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const actionLabel = copyValueActionLabel(label, copied);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="min-w-0 break-all">{displayValue}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={() => void copy()}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="sr-only">{actionLabel}</span>
      </Button>
    </div>
  );
}
