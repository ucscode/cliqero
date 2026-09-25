"use client";

import { useState } from "react";
import { Button } from "../ui/button";

export function OneTimeSecret({
  title,
  value,
  onDismiss,
}: {
  title: string;
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div
      className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      role="status"
    >
      <p className="eyebrow">Shown once</p>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">
        Copy this value now. It will not be recoverable after you dismiss this message.
      </p>
      <code className="block break-all rounded-md border border-emerald-200 bg-white p-3 text-sm">
        {value}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
        <Button variant="secondary" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}
