"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";
import { SidebarMenuButton } from "../ui/sidebar";

export function DashboardSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      router.refresh();
      router.push("/");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <>
      <SidebarMenuButton type="button" onClick={() => void signOut()} disabled={busy}>
        <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
        {busy ? "Signing out…" : "Sign out"}
      </SidebarMenuButton>
      {error && (
        <p className="px-3 text-xs text-red-700" role="alert">
          We couldn’t sign you out. Please try again.
        </p>
      )}
    </>
  );
}

export function EmailVerificationNotice({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/email-verified`,
      });
      if (result.error) throw result.error;
      setMessage("Verification email sent.");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-6 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div>
        <p className="font-semibold">Your email address is not verified.</p>
        <p className="mt-1 text-amber-900">
          Verify your email to keep your account details up to date.
        </p>
        {message && <p className="mt-2 font-medium text-emerald-800">{message}</p>}
        {error && (
          <p className="mt-2 text-red-700" role="alert">
            We couldn’t resend the verification email. Please try again.
          </p>
        )}
      </div>
      <Button type="button" variant="outline" onClick={() => void resend()} disabled={busy}>
        {busy ? "Sending…" : "Resend verification email"}
      </Button>
    </div>
  );
}
