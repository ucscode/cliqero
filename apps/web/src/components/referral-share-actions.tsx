"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Toast } from "./toast";

type ReferralShareActionsProps = {
  url: string;
  compact?: boolean;
};

export function ReferralShareActions({ url, compact = false }: ReferralShareActionsProps) {
  const [state, setState] = useState<"idle" | "copied" | "shared" | "fallback">("idle");
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("fallback");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!navigator.share) {
      await copy();
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ title: "Share on Cliqero", url });
      setState("shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("fallback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`grid gap-2 ${compact ? "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" : ""}`}
    >
      <div className="flex min-w-0 gap-2">
        <label className="sr-only" htmlFor={`referral-link-${url}`}>
          Referral link
        </label>
        <Input
          id={`referral-link-${url}`}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy} disabled={busy}>
          {state === "copied" ? "Copied" : "Copy link"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void share()} disabled={busy}>
          Share
        </Button>
      </div>
      {state === "fallback" && (
        <Toast tone="success">
          Copying is unavailable. Select the link above to copy it manually.
        </Toast>
      )}
      {state === "shared" && <Toast tone="success">Referral link shared.</Toast>}
    </div>
  );
}
