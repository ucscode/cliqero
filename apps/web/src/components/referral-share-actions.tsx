"use client";

import { useEffect, useRef, useState } from "react";
import {
  FacebookLogoIcon,
  LinkedinLogoIcon,
  TelegramLogoIcon,
  WhatsappLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react";
import { Share2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Toast } from "./toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { createCopyFeedbackReset } from "./referral-copy-feedback";

type ReferralShareActionsProps = {
  url: string;
  compact?: boolean;
};

export function referralShareDestinations(url: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent("Take a look at this catalogue listing");
  return [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
  ] as const;
}

export function ReferralShareActions({ url, compact = false }: ReferralShareActionsProps) {
  const [state, setState] = useState<"idle" | "copied" | "shared" | "fallback">("idle");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const copyFeedback = useRef<ReturnType<typeof createCopyFeedbackReset> | null>(null);

  useEffect(() => {
    const feedback = createCopyFeedbackReset(() => setState("idle"));
    copyFeedback.current = feedback;
    return () => feedback.dispose();
  }, []);

  async function copy() {
    setBusy(true);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setState("copied");
      copyFeedback.current?.schedule();
    } catch {
      setState("fallback");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!navigator.share) return;
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

  const iconByDestination = {
    WhatsApp: WhatsappLogoIcon,
    Facebook: FacebookLogoIcon,
    X: XLogoIcon,
    LinkedIn: LinkedinLogoIcon,
    Telegram: TelegramLogoIcon,
  } as const;
  const destinations = referralShareDestinations(url).map((destination) => ({
    ...destination,
    icon: iconByDestination[destination.label],
  }));

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
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" disabled={busy}>
              <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Share
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share referral link</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {destinations.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  onClick={() => setShareOpen(false)}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </a>
              ))}
            </div>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void share()}
                disabled={busy}
              >
                <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Use device sharing
              </Button>
            )}
          </DialogContent>
        </Dialog>
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
