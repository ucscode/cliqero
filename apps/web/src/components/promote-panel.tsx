"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { ReferralShareActions } from "./referral/share-actions";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Toast } from "./toast";

/** Promotion has no server-side link inventory: URLs are deterministic per listing/account. */
export function PromotePanel() {
  const [accountReferralUrl, setAccountReferralUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ url: string }>("/api/referrals/account-url")
      .then((value) => {
        if (!cancelled) setAccountReferralUrl(value.url);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "We couldn’t load your referral link.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="grid gap-6" aria-labelledby="promote-heading">
      <div>
        <p className="eyebrow">Promote</p>
        <h2 id="promote-heading" className="text-2xl font-semibold tracking-tight">
          Share useful opportunities
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Invite people to Cliqero or share catalogue listings you genuinely recommend. A qualifying
          purchase may create referral earnings; a visit alone never guarantees a commission.
        </p>
      </div>
      {error && <Toast>{error}</Toast>}
      <Card>
        <CardHeader>
          <CardTitle>Invite people to Cliqero</CardTitle>
          <p className="text-sm text-slate-500">
            People who join Cliqero through your invitation may become part of your referral
            network.
          </p>
        </CardHeader>
        <CardContent>
          {accountReferralUrl ? (
            <ReferralShareActions url={accountReferralUrl} shareText="Join me on Cliqero" />
          ) : error ? null : (
            <Skeleton className="h-10 w-full" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Promote catalogue listings</CardTitle>
          <p className="text-sm text-slate-500">
            Browse eligible listings and share their referral links.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-fit">
            <Link href="/catalogue">
              Browse the catalogue <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
