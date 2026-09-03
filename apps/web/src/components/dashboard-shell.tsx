"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  apiFetch,
  ApiClientError,
  formatMinorUsd,
  safeContinuation,
  type CheckoutStatus,
  type AccountAccess,
  type EarningsSummary,
  type Listing,
  type PurchasePage,
  type WalletSummary,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";
import { PurchasesPanel } from "./purchases-panel";
import { WalletPanel } from "./wallet-panel";
import { PromotePanel } from "./promote-panel";
import { ReferralsPanel } from "./referrals-panel";
import { EarningsPanel } from "./earnings-panel";
import { WithdrawalsPanel } from "./withdrawals-panel";
import { SettingsPanel } from "./settings-panel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar";

const navigation = [
  { label: "Overview", href: "/dashboard", section: "overview" },
  { label: "Catalogue", href: "/", section: "catalogue" },
  { label: "Wallet", href: "/dashboard?section=wallet", section: "wallet" },
  { label: "Purchases", href: "/dashboard?section=purchases", section: "purchases" },
  { label: "Promote", href: "/dashboard?section=promote", section: "promote" },
  { label: "Referrals", href: "/dashboard?section=referrals", section: "referrals" },
  { label: "Earnings", href: "/dashboard?section=earnings", section: "earnings" },
  { label: "Withdrawals", href: "/dashboard?section=withdrawals", section: "withdrawals" },
  { label: "Settings", href: "/dashboard?section=settings", section: "settings" },
];

export function DashboardShell() {
  const session = authClient.useSession();
  const params = useSearchParams();
  const section = params.get("section") ?? (params.get("buy") ? "checkout" : "overview");
  const buy = params.get("buy");
  const selectedPurchase = params.get("purchase") ?? undefined;
  const returnTo = safeContinuation(params.get("return"), "");
  const [profile, setProfile] = useState<{ handle: string; email: string } | null>(null);
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.data?.user) return;
    void apiFetch<{ handle: string; email: string }>("/api/me/profile")
      .then(setProfile)
      .catch(() => undefined);
    void apiFetch<AccountAccess>("/api/me/access")
      .then(setAccountAccess)
      .catch(() => undefined);
  }, [session.data?.user]);

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
      : section === "withdrawals"
        ? "Withdrawals"
        : section === "settings"
          ? "Settings"
          : (navigation.find((item) => item.section === section)?.label ?? "Dashboard");
  const content =
    section === "wallet" ? (
      <WalletPanel
        returnTo={returnTo || (buy ? `/dashboard?buy=${encodeURIComponent(buy)}` : undefined)}
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
        <CheckoutFlow listing={listing} />
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
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-sm font-bold text-white">
                C
              </span>
              <span>cliqero</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Your space</SidebarGroupLabel>
              <SidebarMenu aria-label="Dashboard navigation">
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={section === item.section}>
                      <Link href={item.href}>{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {accountAccess?.canAccessOperator && (
                  <SidebarMenuItem className="mt-2 border-t border-slate-200 pt-2">
                    <SidebarMenuButton asChild>
                      <Link href="/operator">Operator console</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenuButton asChild>
              <Link href="/">← Browse catalogue</Link>
            </SidebarMenuButton>
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
                  {(profile?.handle ?? session.data.user.name ?? "C").slice(0, 1).toUpperCase()}
                </span>
                <span>{profile?.handle ?? session.data.user.name}</span>
              </div>
            </header>
            {error && <Toast>{error}</Toast>}
            {content}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function DashboardOverview({ profile }: { profile: { handle: string; email: string } | null }) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [purchases, setPurchases] = useState<PurchasePage | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void Promise.all([
      apiFetch<WalletSummary>("/api/wallet"),
      apiFetch<PurchasePage>("/api/purchases?limit=3"),
      apiFetch<EarningsSummary>("/api/earnings"),
    ])
      .then(([walletSummary, purchasePage, earningsSummary]) => {
        setWallet(walletSummary);
        setPurchases(purchasePage);
        setEarnings(earningsSummary);
      })
      .catch(() => setError(true));
  }, []);
  return (
    <>
      {error && <Toast>Some account summaries are temporarily unavailable.</Toast>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="eyebrow">Available wallet</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            <Money minor={wallet?.available_minor ?? "0"} currency="USD" />
          </h2>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=wallet"
          >
            View wallet ↗
          </Link>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Available earnings</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            <Money
              minor={
                earnings?.balances.find((balance) => balance.state === "available")?.amount_minor ??
                "0"
              }
              currency="USD"
            />
          </h2>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=earnings"
          >
            View earnings ↗
          </Link>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Purchases</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            {purchases?.items.length ?? "—"}
          </h2>
          <p className="text-sm text-slate-500">Recent purchases in your collection.</p>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=purchases"
          >
            View purchases ↗
          </Link>
        </Card>
      </div>
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Cliqero dashboard</p>
          <h2>Keep exploring, {profile?.handle ?? "there"}.</h2>
          <p>Your wallet and purchases are ready when you are.</p>
        </div>
        <Button asChild>
          <Link href="/">Explore catalogue</Link>
        </Button>
      </Card>
    </>
  );
}

function CheckoutFlow({ listing }: { listing: Listing }) {
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [shortfallMinor, setShortfallMinor] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const storageKey = `cliqero.checkout.${listing.id}`;

  useEffect(() => {
    try {
      idempotencyKey.current = sessionStorage.getItem(storageKey);
    } catch {
      idempotencyKey.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    const checkoutId = checkout?.id;
    if (!checkoutId) return;
    let attempts = 0;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      attempts += 1;
      try {
        const latest = await apiFetch<CheckoutStatus>(`/api/checkout/${checkoutId}`);
        setCheckout(latest);
        if (latest.state === "awaiting_funds")
          void apiFetch<WalletSummary>("/api/wallet").then(setWallet);
        if (latest.state !== "awaiting_funds") {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // A storage failure does not change backend checkout semantics.
          }
          idempotencyKey.current = null;
          return;
        }
        if (attempts >= 20) return;
      } catch {
        if (attempts >= 20) return;
      }
      window.setTimeout(() => void poll(), 4000);
    };
    const timer = window.setTimeout(() => void poll(), 1000);
    return () => window.clearTimeout(timer);
  }, [checkout?.id, storageKey]);

  async function startCheckout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = idempotencyKey.current ?? `ui-checkout-${listing.id}-${crypto.randomUUID()}`;
    idempotencyKey.current = key;
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      // The backend idempotency key remains authoritative if storage is unavailable.
    }
    try {
      const result = await apiFetch<
        CheckoutStatus & {
          available: { amount_minor: string; currency: string };
          shortfall: { amount_minor: string; currency: string };
        }
      >("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ listing_id: listing.id }),
      });
      setCheckout(result);
      setWallet({
        currency: "USD",
        available_minor: result.available.amount_minor,
        pending_minor: "0",
      });
      setShortfallMinor(result.shortfall.amount_minor);
      setStarted(true);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Checkout could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid gap-4 p-5">
      <p className="eyebrow">One listing, one checkout</p>
      <h2>{listing.title}</h2>
      <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
      {!started ? (
        <>
          <p>Use your available Cliqero wallet balance to complete this purchase.</p>
          <Button onClick={startCheckout} disabled={busy}>
            {busy ? "Creating checkout…" : "Continue to wallet checkout"}
          </Button>
        </>
      ) : checkout?.state === "awaiting_funds" ? (
        <>
          <Badge variant="destructive">Awaiting funds</Badge>
          <p>
            {shortfallMinor && BigInt(shortfallMinor) > 0n
              ? `You need ${formatMinorUsd(shortfallMinor)} more in your available wallet.`
              : "Your checkout is waiting for available wallet funds."}
          </p>
          {wallet && (
            <p className="text-sm text-slate-600">
              Available wallet: <Money minor={wallet.available_minor} currency={wallet.currency} />
            </p>
          )}
          <Button asChild>
            <Link
              href={`/dashboard?section=wallet&return=${encodeURIComponent(`/dashboard?buy=${listing.id}`)}`}
            >
              Fund wallet
            </Link>
          </Button>
          <p className="text-sm text-slate-500">
            This checkout is preserved while your funding settles.
          </p>
        </>
      ) : checkout?.state === "paid" ? (
        <>
          <Badge variant="default">Payment confirmed</Badge>
          <p>Wallet debit is complete. Your entitlement is being prepared separately.</p>
          <Button asChild>
            <Link href="/dashboard?section=purchases">View purchases</Link>
          </Button>
        </>
      ) : (
        <>
          <Badge variant="secondary">Checkout unavailable</Badge>
          <p>{error ?? "This checkout could not be completed."}</p>
          <Button variant="secondary" onClick={() => setStarted(false)}>
            Try again
          </Button>
        </>
      )}
      {error && <Toast>{error}</Toast>}
    </Card>
  );
}
