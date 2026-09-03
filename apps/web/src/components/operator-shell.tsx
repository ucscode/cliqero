"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type OperatorOverview } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState, Toast } from "./ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type OperatorRole = "operator" | "catalogue_manager";

export function OperatorShell({
  role,
  handle,
  email,
  activeSection = "overview",
  title = "Overview",
  children,
}: {
  role: OperatorRole;
  handle: string;
  email: string;
  activeSection?:
    | "overview"
    | "catalogue"
    | "users"
    | "network"
    | "funding"
    | "distributions"
    | "earnings"
    | "withdrawals"
    | "treasury";
  title?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiFetch<OperatorOverview>("/api/operator/overview")
      .then((value) => {
        if (active) setOverview(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Overview is temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="operator-layout">
      <aside className={menuOpen ? "operator-sidebar open" : "operator-sidebar"}>
        <div className="operator-brand-row">
          <Link href="/" className="brand">
            <span className="brand-mark">C</span>
            <span>cliqero</span>
          </Link>
          <button
            className="operator-menu-close"
            type="button"
            aria-label="Close operator navigation"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="operator-console-label">
          <span className="eyebrow">Operations</span>
          <Badge variant="destructive">
            {role === "operator" ? "Operator" : "Catalogue manager"}
          </Badge>
        </div>
        <nav id="operator-navigation" aria-label="Operator navigation" className="operator-nav">
          <Link
            className={activeSection === "overview" ? "active" : ""}
            href="/operator"
            onClick={() => setMenuOpen(false)}
          >
            Overview
          </Link>
          <Link
            className={activeSection === "catalogue" ? "active" : ""}
            href="/operator/catalogue"
            onClick={() => setMenuOpen(false)}
          >
            Catalogue
          </Link>
          {role === "operator" && (
            <>
              <Link
                className={activeSection === "users" ? "active" : ""}
                href="/operator/users"
                onClick={() => setMenuOpen(false)}
              >
                Users
              </Link>
              <Link
                className={activeSection === "network" ? "active" : ""}
                href="/operator/network"
                onClick={() => setMenuOpen(false)}
              >
                Network
              </Link>
              <Link
                className={activeSection === "funding" ? "active" : ""}
                href="/operator/funding"
                onClick={() => setMenuOpen(false)}
              >
                Funding
              </Link>
              <Link
                className={activeSection === "distributions" ? "active" : ""}
                href="/operator/distributions"
                onClick={() => setMenuOpen(false)}
              >
                Distributions
              </Link>
              <Link
                className={activeSection === "earnings" ? "active" : ""}
                href="/operator/earnings"
                onClick={() => setMenuOpen(false)}
              >
                Earnings
              </Link>
              <Link
                className={activeSection === "withdrawals" ? "active" : ""}
                href="/operator/withdrawals"
                onClick={() => setMenuOpen(false)}
              >
                Withdrawals
              </Link>
              <Link
                className={activeSection === "treasury" ? "active" : ""}
                href="/operator/treasury"
                onClick={() => setMenuOpen(false)}
              >
                Treasury
              </Link>
            </>
          )}
        </nav>
        <Link className="operator-user-link" href="/dashboard" onClick={() => setMenuOpen(false)}>
          ← User dashboard
        </Link>
      </aside>

      <main className="operator-main">
        <header className="operator-topbar">
          <button
            className="operator-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="operator-navigation"
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
          <div>
            <p className="eyebrow">Operational view</p>
            <h1>{title}</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100"
                aria-label="Open operator account menu"
              >
                <span className="avatar">{handle.slice(0, 1).toUpperCase()}</span>
                <span>{handle}</span>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs text-slate-500" disabled>
                {email}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard?section=settings">Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {children ?? (
          <section aria-labelledby="operator-overview-heading">
            <div className="operator-heading">
              <div>
                <p className="eyebrow">
                  {role === "operator" ? "Platform operations" : "Catalogue operations"}
                </p>
                <h2 id="operator-overview-heading">
                  {role === "operator"
                    ? "A clear view of the platform"
                    : "A focused catalogue view"}
                </h2>
                <p className="panel-intro">
                  {role === "operator"
                    ? "Authoritative operational counts from Cliqero services."
                    : "Only catalogue information is available to this role."}
                </p>
              </div>
              <Badge variant="default">
                {role === "operator" ? "Full operator access" : "Catalogue scope"}
              </Badge>
            </div>
            {error && <Toast>{error}</Toast>}
            {loading ? (
              <div className="operator-metric-grid" aria-label="Loading overview">
                {Array.from({ length: role === "operator" ? 7 : 3 }, (_, index) => (
                  <Card className="operator-metric-card" key={index}>
                    <Skeleton className="operator-metric-skeleton" />
                  </Card>
                ))}
              </div>
            ) : overview ? (
              <OverviewMetrics overview={overview} />
            ) : (
              <Card>
                <EmptyState title="Overview unavailable" description="Try refreshing this page." />
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Refresh
                </Button>
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function OverviewMetrics({ overview }: { overview: OperatorOverview }) {
  const cards: Array<readonly [string, number, string]> = [
    ["Published listings", overview.catalogue.published, "Catalogue"],
    ["Draft listings", overview.catalogue.draft, "Catalogue"],
    ["Archived listings", overview.catalogue.archived, "Catalogue"],
  ];
  if (overview.users && overview.commerce && overview.withdrawals) {
    cards.push(
      ["Accounts", overview.users.total, "Identity"],
      ["Purchases", overview.commerce.purchases, "Commerce"],
      ["Requested withdrawals", overview.withdrawals.requested, "Withdrawals"],
      ["Approved withdrawals", overview.withdrawals.approved, "Withdrawals"],
    );
  }
  return (
    <div className="operator-metric-grid">
      {cards.map(([label, value, group]) => (
        <Card className="operator-metric-card" key={label}>
          <p className="eyebrow">{group}</p>
          <p className="operator-metric-value">{value.toLocaleString("en-US")}</p>
          <p className="operator-metric-label">{label}</p>
        </Card>
      ))}
    </div>
  );
}
