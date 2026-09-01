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
import { Badge, Button, Card, EmptyState, Money, Skeleton, Toast } from "./ui";
import { PurchasesPanel } from "./purchases-panel";
import { WalletPanel } from "./wallet-panel";
import { PromotePanel } from "./promote-panel";
import { ReferralsPanel } from "./referrals-panel";
import { EarningsPanel } from "./earnings-panel";
import { WithdrawalsPanel } from "./withdrawals-panel";
import { SettingsPanel } from "./settings-panel";

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
      <div className="dashboard-loading">
        <Skeleton className="detail-skeleton" />
      </div>
    );
  if (!session.data?.user)
    return (
      <main className="page-shell">
        <EmptyState
          title="Sign in to continue"
          description="Your dashboard is private to your Cliqero account."
        />
        <Link className="button" href={`/login?next=${encodeURIComponent("/dashboard")}`}>
          Sign in
        </Link>
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
        <Skeleton className="detail-skeleton" />
      )
    ) : (
      <DashboardOverview profile={profile} />
    );

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">C</span>
          <span>cliqero</span>
        </Link>
        <nav aria-label="Dashboard navigation">
          {navigation.map((item) => (
            <Link
              className={section === item.section ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          {accountAccess?.canAccessOperator && (
            <Link className="dashboard-operator-link" href="/operator">
              Operator console
            </Link>
          )}
        </nav>
        <Link className="sidebar-back" href="/">
          ← Browse catalogue
        </Link>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="eyebrow">Your space</p>
            <h1>{title}</h1>
          </div>
          <div className="account-chip">
            <span className="avatar">
              {(profile?.handle ?? session.data.user.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <span>{profile?.handle ?? session.data.user.name}</span>
          </div>
        </header>
        {error && <Toast>{error}</Toast>}
        {content}
      </main>
    </div>
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
      <div className="dashboard-summary-grid">
        <Card>
          <p className="eyebrow">Available wallet</p>
          <h2 className="summary-amount">
            <Money minor={wallet?.available_minor ?? "0"} currency="USD" />
          </h2>
          <Link className="arrow-link" href="/dashboard?section=wallet">
            View wallet ↗
          </Link>
        </Card>
        <Card>
          <p className="eyebrow">Available earnings</p>
          <h2 className="summary-amount">
            <Money
              minor={
                earnings?.balances.find((balance) => balance.state === "available")?.amount_minor ??
                "0"
              }
              currency="USD"
            />
          </h2>
          <Link className="arrow-link" href="/dashboard?section=earnings">
            View earnings ↗
          </Link>
        </Card>
        <Card>
          <p className="eyebrow">Purchases</p>
          <h2 className="summary-amount">{purchases?.items.length ?? "—"}</h2>
          <p className="summary-copy">Recent purchases in your collection.</p>
          <Link className="arrow-link" href="/dashboard?section=purchases">
            View purchases ↗
          </Link>
        </Card>
      </div>
      <Card className="welcome-card">
        <div>
          <p className="eyebrow">Cliqero dashboard</p>
          <h2>Keep exploring, {profile?.handle ?? "there"}.</h2>
          <p>Your wallet and purchases are ready when you are.</p>
        </div>
        <Link className="button" href="/">
          Explore catalogue
        </Link>
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
    <Card className="checkout-card">
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
          <Badge tone="accent">Awaiting funds</Badge>
          <p>
            {shortfallMinor && BigInt(shortfallMinor) > 0n
              ? `You need ${formatMinorUsd(shortfallMinor)} more in your available wallet.`
              : "Your checkout is waiting for available wallet funds."}
          </p>
          {wallet && (
            <p className="checkout-wallet-balance">
              Available wallet: <Money minor={wallet.available_minor} currency={wallet.currency} />
            </p>
          )}
          <Link
            className="button button-primary"
            href={`/dashboard?section=wallet&return=${encodeURIComponent(`/dashboard?buy=${listing.id}`)}`}
          >
            Fund wallet
          </Link>
          <p className="checkout-note">This checkout is preserved while your funding settles.</p>
        </>
      ) : checkout?.state === "paid" ? (
        <>
          <Badge tone="success">Payment confirmed</Badge>
          <p>Wallet debit is complete. Your entitlement is being prepared separately.</p>
          <Link className="button button-primary" href="/dashboard?section=purchases">
            View purchases
          </Link>
        </>
      ) : (
        <>
          <Badge tone="neutral">Checkout unavailable</Badge>
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
