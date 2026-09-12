"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, LogOut } from "lucide-react";
import { authClient, authDisplayName } from "@/lib/auth-client";
import {
  apiFetch,
  ApiClientError,
  formatMinorUsd,
  safeContinuation,
  walletFundingUrlForCheckout,
  type CheckoutStatus,
  type CheckoutQuote,
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
import { FundingHistoryPanel } from "./funding-history-panel";
import { PromotePanel } from "./promote-panel";
import { ReferralsPanel } from "./referrals-panel";
import { EarningsPanel } from "./earnings-panel";
import { WithdrawalsPanel } from "./withdrawals-panel";
import { SettingsPanel } from "./settings-panel";
import { BrandLink } from "./brand-identity";
import { siteConfig } from "@/config/site";
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
  { label: "Catalogue", href: "/catalogue", section: "catalogue" },
  { label: "Wallet", href: "/dashboard?section=wallet", section: "wallet" },
  { label: "Purchases", href: "/dashboard?section=purchases", section: "purchases" },
  { label: "Promote", href: "/dashboard?section=promote", section: "promote" },
  { label: "Referrals", href: "/dashboard?section=referrals", section: "referrals" },
  { label: "Earnings", href: "/dashboard?section=earnings", section: "earnings" },
  { label: "Withdrawals", href: "/dashboard?section=withdrawals", section: "withdrawals" },
  { label: "Settings", href: "/dashboard?section=settings", section: "settings" },
];

const primaryNavigation = navigation.filter((item) =>
  ["overview", "catalogue", "purchases"].includes(item.section),
);
const moneyNavigation = navigation.filter((item) =>
  ["wallet", "earnings", "withdrawals"].includes(item.section),
);
const referralNavigation = navigation.filter((item) =>
  ["promote", "referrals"].includes(item.section),
);

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
    if (!session.data?.user) return;
    void apiFetch<{ username: string; email: string }>("/api/me/profile")
      .then(setProfile)
      .catch(() => undefined);
    void apiFetch<AccountAccess>("/api/me/access")
      .then(setAccountAccess)
      .catch(() => undefined);
  }, [session.data?.user]);

  useEffect(() => {
    if (!session.data?.user) return;
    const refreshSession = () => {
      if (document.visibilityState === "visible") void refetchSession();
    };
    window.addEventListener("focus", refreshSession);
    document.addEventListener("visibilitychange", refreshSession);
    return () => {
      window.removeEventListener("focus", refreshSession);
      document.removeEventListener("visibilitychange", refreshSession);
    };
  }, [session.data?.user, refetchSession]);

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
              : (navigation.find((item) => item.section === section)?.label ?? "Dashboard");
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
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Your space</SidebarGroupLabel>
              <SidebarMenu aria-label="Dashboard navigation">
                {primaryNavigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={section === item.section}>
                      <Link href={item.href}>{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <DashboardNavGroup label="Money" items={moneyNavigation} section={section} />
                <DashboardNavGroup label="Referrals" items={referralNavigation} section={section} />
                <SidebarMenuItem className="mt-2 border-t border-slate-200 pt-2">
                  <SidebarMenuButton
                    asChild
                    isActive={section === "settings"}
                    className="font-medium"
                  >
                    <Link href="/dashboard?section=settings">Settings</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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

function DashboardOverview({ profile }: { profile: { username: string; email: string } | null }) {
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
    <div className="grid gap-6">
      {error && <Toast>Some account summaries are temporarily unavailable.</Toast>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="eyebrow">Available wallet</p>
          <h2 className="my-2 text-3xl font-semibold tracking-tight">
            {wallet ? <Money minor={wallet.available_minor} currency="USD" /> : "Unavailable"}
          </h2>
          <Link
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
            href="/dashboard?section=wallet"
          >
            View wallet <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
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
            View earnings <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
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
            View purchases <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
          </Link>
        </Card>
      </div>
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">{siteConfig.name} dashboard</p>
          <h2>Keep exploring, {profile?.username ?? "there"}.</h2>
          <p>Your wallet and purchases are ready when you are.</p>
        </div>
        <Button asChild>
          <Link href="/catalogue">Explore catalogue</Link>
        </Button>
      </Card>
    </div>
  );
}

function DashboardNavGroup({
  label,
  items,
  section,
}: {
  label: string;
  items: typeof navigation;
  section: string;
}) {
  const active = items.some((item) => item.section === section);
  const [manualOpen, setManualOpen] = useState(false);
  const open = active || manualOpen;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        aria-expanded={open}
        onClick={() => setManualOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenu className="ml-3 border-l border-slate-200 pl-2">
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={section === item.section}>
                <Link href={item.href}>{item.label}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarMenuItem>
  );
}

function DashboardSignOut() {
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

function EmailVerificationNotice({ email }: { email: string }) {
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

function CheckoutFlow({ listing, checkoutId }: { listing: Listing; checkoutId?: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(Boolean(checkoutId));
  const [existingCheckoutLoading, setExistingCheckoutLoading] = useState(Boolean(checkoutId));
  const [shortfallMinor, setShortfallMinor] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
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
    let active = true;
    // The initial network read intentionally establishes the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBalanceLoading(true);
    setBalanceError(null);
    void apiFetch<CheckoutQuote>(`/api/checkout?listing_id=${encodeURIComponent(listing.id)}`)
      .then((quote) => {
        if (!active) return;
        setWallet({
          currency: "USD",
          available_minor: quote.available.amount_minor,
          pending_minor: "0",
        });
        setShortfallMinor(quote.shortfall.amount_minor);
      })
      .catch(() => {
        if (active) setBalanceError("We couldn't load your wallet balance right now.");
      })
      .finally(() => {
        if (active) setBalanceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listing.id]);

  useEffect(() => {
    if (!checkoutId) return;
    let active = true;
    void apiFetch<CheckoutStatus>(`/api/checkout/${checkoutId}`)
      .then((current) => {
        if (!active) return;
        setCheckout(current);
        setStarted(true);
      })
      .catch(() => {
        if (active)
          setError("We couldn't load this checkout. Please return to Purchases and try again.");
      })
      .finally(() => {
        if (active) setExistingCheckoutLoading(false);
      });
    return () => {
      active = false;
    };
  }, [checkoutId]);

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
      if (BigInt(result.shortfall.amount_minor) > 0n) {
        router.push(walletFundingUrlForCheckout(listing.id, result.id));
      }
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Checkout could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="bg-emerald-50/70 p-5 sm:p-6">
        <p className="text-sm text-slate-600">Available wallet balance</p>
        {balanceLoading ? (
          <p className="mt-2 text-sm text-slate-600" role="status">
            Loading available wallet balance…
          </p>
        ) : balanceError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {balanceError}
          </p>
        ) : (
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {wallet ? <Money minor={wallet.available_minor} currency="USD" /> : "Unavailable"}
          </p>
        )}
      </Card>
      <Card className="grid gap-4 p-5">
        <p className="eyebrow">One listing, one checkout</p>
        <h2>{listing.title}</h2>
        <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
        {!started ? (
          <>
            <div className="grid gap-1 text-sm text-slate-600">
              <p>
                Purchase total:{" "}
                <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
              </p>
              {!balanceLoading &&
                !balanceError &&
                shortfallMinor &&
                (BigInt(shortfallMinor) > 0n ? (
                  <p>You need {formatMinorUsd(shortfallMinor)} more to complete this purchase.</p>
                ) : (
                  <p>Your wallet balance covers this purchase.</p>
                ))}
            </div>
            <Button
              onClick={startCheckout}
              disabled={
                busy ||
                balanceLoading ||
                existingCheckoutLoading ||
                !!balanceError ||
                (!!checkoutId && !!error)
              }
            >
              {busy
                ? "Creating checkout…"
                : existingCheckoutLoading
                  ? "Loading checkout…"
                  : wallet && shortfallMinor && BigInt(shortfallMinor) > 0n
                    ? "Fund wallet"
                    : "Continue to wallet checkout"}
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
    </div>
  );
}
