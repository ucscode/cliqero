"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch, ApiClientError, formatMinorUsd, type Listing } from "@/lib/api-client";
import { Button, Card, EmptyState, Money, Skeleton, Toast } from "./ui";
import { useEffect, useRef, useState } from "react";

const navigation = [
  { label: "Overview", href: "/dashboard" },
  { label: "Catalogue", href: "/" },
  { label: "Wallet", href: "/dashboard?section=wallet" },
  { label: "Purchases", href: "/dashboard?section=purchases" },
  { label: "Promote", href: "/dashboard?section=promote" },
  { label: "Referral network", href: "/dashboard?section=network" },
  { label: "Earnings", href: "/dashboard?section=earnings" },
];

export function DashboardShell() {
  const session = authClient.useSession();
  const params = useSearchParams();
  const section = params.get("section") ?? "overview";
  const buy = params.get("buy");
  const [profile, setProfile] = useState<{ handle: string; email: string } | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [checkoutState, setCheckoutState] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutKey = useRef<string | null>(null);
  useEffect(() => {
    if (!session.data?.user) return;
    void apiFetch<{ handle: string; email: string }>("/api/me/profile")
      .then(setProfile)
      .catch(() => undefined);
  }, [session.data?.user]);
  useEffect(() => {
    if (!buy) return;
    void apiFetch<Listing>(`/api/listings/${buy}`)
      .then(setListing)
      .catch(() => setError("This listing is no longer available."));
  }, [buy]);
  async function checkout() {
    if (!listing) return;
    if (checkoutBusy) return;
    setError(null);
    setCheckoutBusy(true);
    setCheckoutState("Creating checkout…");
    if (!checkoutKey.current) checkoutKey.current = `ui-${listing.id}-${crypto.randomUUID()}`;
    try {
      const result = await apiFetch<{ state: string; shortfall: { amount_minor: string } }>(
        "/api/checkout",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": checkoutKey.current,
          },
          body: JSON.stringify({ listing_id: listing.id }),
        },
      );
      setCheckoutState(
        result.state === "awaiting_funds"
          ? `You need ${MoneyValue(result.shortfall.amount_minor)} more in your wallet.`
          : "Checkout created.",
      );
    } catch (cause) {
      setCheckoutState(null);
      setError(cause instanceof ApiClientError ? cause.message : "Checkout could not be created.");
    } finally {
      setCheckoutBusy(false);
    }
  }
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
        <Link className="button" href="/login?next=/dashboard">
          Sign in
        </Link>
      </main>
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
              className={section === (item.href.split("section=")[1] ?? "overview") ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="sidebar-back" href="/">
          ← Browse catalogue
        </Link>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="eyebrow">Your space</p>
            <h1>
              {section === "overview"
                ? "Good morning."
                : (navigation.find((item) => item.href.includes(`section=${section}`))?.label ??
                  "Dashboard")}
            </h1>
          </div>
          <div className="account-chip">
            <span className="avatar">
              {(profile?.handle ?? session.data.user.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <span>{profile?.handle ?? session.data.user.name}</span>
          </div>
        </header>
        {error && <Toast>{error}</Toast>}
        {buy && listing ? (
          <Card className="checkout-card">
            <p className="eyebrow">Ready when you are</p>
            <h2>{listing.title}</h2>
            <p>Pay from your available Cliqero wallet balance.</p>
            <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
            <Button onClick={checkout} disabled={checkoutBusy}>
              {checkoutBusy ? "Creating checkout…" : "Continue to wallet checkout"}
            </Button>
            {checkoutState && <p className="checkout-result">{checkoutState}</p>}
          </Card>
        ) : (
          <Card className="welcome-card">
            <div>
              <p className="eyebrow">Cliqero dashboard</p>
              <h2>Keep exploring, {profile?.handle ?? session.data.user.name ?? "there"}.</h2>
              <p>
                Your purchases, wallet and referral activity will live here as you build your
                Cliqero journey.
              </p>
            </div>
            <Link className="button" href="/">
              Explore catalogue
            </Link>
          </Card>
        )}
        <div className="dashboard-grid">
          <Card>
            <p className="eyebrow">Next up</p>
            <h3>Build your collection</h3>
            <p>Discover something useful from the public catalogue.</p>
            <Link className="arrow-link" href="/">
              Browse listings ↗
            </Link>
          </Card>
          <Card>
            <p className="eyebrow">Your account</p>
            <h3>{profile?.handle ?? "Account"}</h3>
            <p>{profile?.email ?? session.data.user.email}</p>
            <Link className="arrow-link" href="/dashboard?section=profile">
              Manage profile ↗
            </Link>
          </Card>
        </div>
      </main>
    </div>
  );
}

function MoneyValue(minor: string) {
  return formatMinorUsd(minor);
}
