"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authClient, authDisplayName } from "@/lib/auth-client";
import { apiFetch, safeContinuation, type AccountAccess, type Listing } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { PurchasesPanel } from "../purchase/panel";
import { WalletPanel } from "../wallet/panel";
import { FundingHistoryPanel } from "../funding/history";
import { PromotePanel } from "../promote-panel";
import { ReferralsPanel } from "../referral/panel";
import { EarningsPanel } from "../earnings-panel";
import { WithdrawalsPanel } from "../withdrawal/panel";
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
  const userId = session.data?.user?.id;
  const lastSessionRefreshAt = useRef(0);
  const params = useSearchParams();
  const section =
    dedicatedWalletFunding || fundingHistoryPage
      ? "wallet"
      : (params.get("section") ?? (params.get("buy") ? "checkout" : "overview"));
  const buy = params.get("buy");
  const checkoutId = params.get("checkout") ?? undefined;
  const fundingId = params.get("funding") ?? undefined;
  const selectedPurchase = params.get("purchase") ?? undefined;
  const checkoutContinuation = buy
    ? `/dashboard?buy=${encodeURIComponent(buy)}${
        checkoutId ? `&checkout=${encodeURIComponent(checkoutId)}` : ""
      }`
    : undefined;
  const returnTo = safeContinuation(params.get("return"), checkoutContinuation ?? "");
  const [profile, setProfile] = useState<{ username: string; email: string } | null>(null);
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void apiFetch<{ username: string; email: string }>("/api/me/profile")
      .then(setProfile)
      .catch(() => undefined);
    void apiFetch<AccountAccess>("/api/me/access")
      .then(setAccountAccess)
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
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
  }, [refetchSession, userId]);

  useEffect(() => {
    if (!buy) return;
    void apiFetch<Listing>(`/api/listings/${buy}`)
      .then(setListing)
      .catch(() => setError("This listing is no longer available."));
  }, [buy]);

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

  const title =
    section === "checkout"
      ? "Checkout"
      : section === "wallet" && fundingHistoryPage
        ? "Funding history"
        : section === "wallet" && dedicatedWalletFunding
          ? "Fund wallet"
          : section === "withdrawals"
            ? "Withdrawals"
            : section === "settings"
              ? "Settings"
              : dashboardSectionTitle(section);
  const providerDisplayName = authDisplayName(session.data.user);
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
    <PurchasesPanel selectedId={selectedPurchase} />
  ) : section === "promote" ? (
    <PromotePanel />
  ) : section === "referrals" ? (
    <ReferralsPanel />
  ) : section === "earnings" ? (
    <EarningsPanel />
  ) : section === "withdrawals" ? (
    <WithdrawalsPanel />
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
                  {(profile?.username ?? providerDisplayName).slice(0, 1).toUpperCase()}
                </span>
                <span>{profile?.username ?? providerDisplayName}</span>
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
