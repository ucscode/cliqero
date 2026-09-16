"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

export function AccountSettings() {
  const session = authClient.useSession();
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Account</p>
          <h3>Authentication and account context</h3>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Signed in as</dt>
          <dd>{session.data?.user?.email ?? "—"}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Authentication</dt>
          <dd>Better Auth session</dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Provider linking</dt>
          <dd>Managed by Better Auth</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed text-slate-500">
        Password resets, email changes, and provider unlinking remain in the authentication flow and
        are not changed by Cliqero profile settings.
      </p>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </Card>
  );
}
