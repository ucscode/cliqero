"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  ApiClientError,
  apiFetch,
  safeContinuation,
  type AccountAccess,
  type Listing,
} from "@/lib/api-client";
import {
  fetchCanonicalApplicationSession,
  type CanonicalApplicationSession,
} from "@/lib/application-session";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { PurchasesPanel } from "../purchase/panel";
import { WalletPanel } from "../wallet/panel";
import { FundingHistoryPanel } from "../funding/history";
import { PromotePanel } from "../promote-panel";
import { HierarchyPanel } from "../hierarchy/panel";
import { ReferralsPanel } from "../referral/panel";
import { EarningsPanel } from "../earnings-panel";
import { WithdrawalsPanel } from "../withdrawal/panel";
import { PursePanel } from "../withdrawal/purse/panel";
import { SettingsPanel } from "../settings";
import { BrandLink } from "../brand-identity";
import { CheckoutFlow } from "../checkout/flow";
import { DashboardOverview } from "./overview";
import { dashboardSectionTitle, DashboardNavigation } from "./navigation";
import { DashboardSignOut, EmailVerificationNotice } from "./account-controls";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "../ui/sidebar";

type CanonicalApplicationState = {
  userId: string;
  session: CanonicalApplicationSession | null;
  error: string | null;
};

export function DashboardShell({
  dedicatedWalletFunding = false,
  fundingProvider,
  fundingAmount,
  fundingHistoryPage = false,
}: {
  dedicatedWalletFunding?: boolean;
  fundingProvider?: string;
  fundingAmount?: string;
  fundingHistoryPage?: boolean;
}) {
  const session = authClient.useSession();
  const { refetch: refetchSession } = session;
  const router = useRouter();
  const userId = session.data?.user?.id;
  const lastSessionRefreshAt = useRef(0);
  const invalidationStarted = useRef(false);
  const params = useSearchParams();
  const section =
    dedicatedWalletFunding || fundingHistoryPage
      ? "wallet"
      : (params.get("section") ?? (params.get("buy") ? "checkout" : "overview"));
  const buy = params.get("buy");
  const checkoutId = params.get("checkout") ?? undefined;
  const fundingId = params.get("funding") ?? undefined;
  const checkoutContinuation = buy
    ? `/dashboard?buy=${encodeURIComponent(buy)}${
        checkoutId ? `&checkout=${encodeURIComponent(checkoutId)}` : ""
      }`
    : undefined;
  const returnTo = safeContinuation(params.get("return"), checkoutContinuation ?? "");
  const [profile, setProfile] = useState<{ username: string; email: string } | null>(null);
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null);
  const [canonicalState, setCanonicalState] = useState<CanonicalApplicationState | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canonicalStateForUser = userId && canonicalState?.userId === userId ? canonicalState : null;
  const canonicalSession = canonicalStateForUser?.session;
  const canonicalSessionError = canonicalStateForUser?.error ?? null;

  const invalidateApplicationSession = useCallback(async () => {
    if (invalidationStarted.current) return;
    invalidationStarted.current = true;
    try {
      await authClient.signOut();
    } catch {
      // The redirect still prevents an unverified application identity from
      // remaining visible if sign-out itself cannot reach the auth endpoint.
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!userId) {
      invalidationStarted.current = false;
      return;
    }
    let cancelled = false;
    invalidationStarted.current = false;
    void fetchCanonicalApplicationSession()
      .then((value) => {
        if (cancelled) return;
        setProfile(null);
        setAccountAccess(null);
        setCanonicalState({ userId, session: value, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          setCanonicalState({ userId, session: null, error: null });
          void invalidateApplicationSession();
          return;
        }
        setCanonicalState({
          userId,
          session: null,
          error: "We couldn’t verify your Cliqero account. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invalidateApplicationSession, userId]);

  useEffect(() => {
    if (!canonicalSession) return;
    void apiFetch<{ username: string; email: string }>("/api/me/profile")
      .then(setProfile)
      .catch((cause: unknown) => {
        if (cause instanceof ApiClientError && cause.status === 401)
          void invalidateApplicationSession();
      });
    void apiFetch<AccountAccess>("/api/me/access")
      .then(setAccountAccess)
      .catch(() => undefined);
  }, [canonicalSession, invalidateApplicationSession]);

  useEffect(() => {
    if (!userId || !canonicalSession) return;
    const refreshSession = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSessionRefreshAt.current < 1000) return;
      lastSessionRefreshAt.current = now;
      void refetchSession();
    };
    window.addEventListener("focus", refreshSession);
    document.addEventListener("visibilitychange", refreshSession);
    return () => {
      window.removeEventListener("focus", refreshSession);
      document.removeEventListener("visibilitychange", refreshSession);
    };
  }, [canonicalSession, refetchSession, userId]);

  useEffect(() => {
    if (!buy || !canonicalSession) return;
    void apiFetch<Listing>(`/api/listings/${buy}`)
      .then(setListing)
      .catch(() => setError("This listing is no longer available."));
  }, [buy, canonicalSession]);

  if (session.isPending)
    return (
      <div className="min-h-screen p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (!session.data?.user)
    return (
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-12">
        <EmptyState
          title="Sign in to continue"
          description="Your dashboard is private to your Cliqero account."
        />
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent("/dashboard")}`}>Sign in</Link>
        </Button>
      </main>
    );
  if (canonicalSession === undefined)
    return (
      <div className="min-h-screen p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (!canonicalSession) {
    if (canonicalSessionError)
      return (
        <main className="mx-auto grid max-w-2xl gap-4 px-4 py-12">
          <EmptyState title="We couldn’t verify your account" description={canonicalSessionError} />
          <Button asChild>
            <Link href="/login">Return to sign in</Link>
          </Button>
        </main>
      );
    return (
      <div className="min-h-screen p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const title =
    section === "checkout"
      ? "Checkout"
      : section === "wallet" && fundingHistoryPage
        ? "Funding history"
        : section === "wallet" && dedicatedWalletFunding
          ? "Fund wallet"
          : section === "withdrawals"
            ? "Withdrawals"
            : section === "purse"
              ? "Purse"
              : section === "settings"
                ? "Settings"
                : dashboardSectionTitle(section);
  const displayUsername = profile?.username ?? canonicalSession.account.username;
  const content = fundingHistoryPage ? (
    <FundingHistoryPanel />
  ) : section === "wallet" ? (
    <WalletPanel
      fundingPage={dedicatedWalletFunding}
      fundingProvider={fundingProvider}
      fundingAmount={fundingAmount}
      fundingId={fundingId}
      returnTo={returnTo || checkoutContinuation}
    />
  ) : section === "purchases" ? (
    <PurchasesPanel />
  ) : section === "promote" ? (
    <PromotePanel />
  ) : section === "hierarchy" ? (
    <HierarchyPanel />
  ) : section === "referrals" ? (
    <ReferralsPanel />
  ) : section === "earnings" ? (
    <EarningsPanel />
  ) : section === "withdrawals" ? (
    <WithdrawalsPanel />
  ) : section === "purse" ? (
    <PursePanel />
  ) : section === "settings" ? (
    <SettingsPanel />
  ) : buy ? (
    listing ? (
      <CheckoutFlow listing={listing} checkoutId={checkoutId} />
    ) : (
      <Skeleton className="h-48 w-full" />
    )
  ) : (
    <DashboardOverview profile={profile} />
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar>
          <SidebarHeader>
            <BrandLink className="text-lg tracking-tight text-slate-950" />
          </SidebarHeader>
          <DashboardNavigation accountAccess={accountAccess} section={section} />
          <SidebarFooter className="grid gap-2 border-t border-slate-200 pt-4">
            <SidebarMenuButton asChild>
              <Link href="/catalogue">
                <ArrowLeft className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Browse catalogue
              </Link>
            </SidebarMenuButton>
            <DashboardSignOut />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <main className="min-w-0 w-full max-w-[1050px] px-4 py-8 sm:px-8 lg:px-16 lg:py-14">
            <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
              <SidebarTrigger aria-label="Open dashboard navigation" />
              <div>
                <p className="eyebrow">Your space</p>
                <h1 className="mb-0 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900">
                  {displayUsername.slice(0, 1).toUpperCase()}
                </span>
                <span>{displayUsername}</span>
              </div>
            </header>
            {!session.data.user.emailVerified && (
              <EmailVerificationNotice email={session.data.user.email} />
            )}
            {error && <Toast>{error}</Toast>}
            {content}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
