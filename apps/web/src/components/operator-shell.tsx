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
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
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

type OperatorRole = "operator" | "catalogue_manager" | "blog_manager";

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
    | "treasury"
    | "blog";
  title?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (role === "blog_manager") {
      return () => {
        active = false;
      };
    }
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
  }, [role]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  const navigation = [
    { key: "overview", href: "/operator", label: "Overview", visible: role !== "blog_manager" },
    {
      key: "catalogue",
      href: "/operator/catalogue",
      label: "Catalogue",
      visible: role === "operator" || role === "catalogue_manager",
    },
    { key: "users", href: "/operator/users", label: "Users", visible: role === "operator" },
    { key: "network", href: "/operator/network", label: "Network", visible: role === "operator" },
    { key: "funding", href: "/operator/funding", label: "Funding", visible: role === "operator" },
    {
      key: "distributions",
      href: "/operator/distributions",
      label: "Distributions",
      visible: role === "operator",
    },
    {
      key: "earnings",
      href: "/operator/earnings",
      label: "Earnings",
      visible: role === "operator",
    },
    {
      key: "withdrawals",
      href: "/operator/withdrawals",
      label: "Withdrawals",
      visible: role === "operator",
    },
    {
      key: "treasury",
      href: "/operator/treasury",
      label: "Treasury",
      visible: role === "operator",
    },
    {
      key: "blog",
      href: "/operator/blog",
      label: "Blog",
      visible: role === "operator" || role === "blog_manager",
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50">
        <Sidebar>
          <SidebarHeader>
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-white">
                C
              </span>
              <span>cliqero</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <div className="grid gap-2 px-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Operations
              </span>
              <Badge variant="destructive">
                {role === "operator" ? "Operator" : "Catalogue manager"}
              </Badge>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu id="operator-navigation" aria-label="Operator navigation">
                {navigation
                  .filter((item) => item.visible)
                  .map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={activeSection === item.key}>
                        <Link href={item.href}>{item.label}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/dashboard">User dashboard</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-4 border-b bg-white/95 px-4 backdrop-blur lg:px-8">
            <div className="flex items-center gap-3">
              <SidebarTrigger aria-label="Open operator navigation" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Operational view
                </p>
                <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="inline-flex items-center gap-2 px-2 py-1.5"
                  aria-label="Open operator account menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">
                    {handle.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{handle}</span>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
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
          <main className="min-w-0 space-y-6 p-4 lg:p-8">
            {children ?? (
              <section aria-labelledby="operator-overview-heading">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                      {role === "operator" ? "Platform operations" : "Catalogue operations"}
                    </p>
                    <h2
                      id="operator-overview-heading"
                      className="text-2xl font-semibold text-slate-900"
                    >
                      {role === "operator"
                        ? "A clear view of the platform"
                        : "A focused catalogue view"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">
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
                  <div
                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                    aria-label="Loading overview"
                  >
                    {Array.from({ length: role === "operator" ? 7 : 3 }, (_, index) => (
                      <Card className="p-6" key={index}>
                        <Skeleton className="h-24 w-full" />
                      </Card>
                    ))}
                  </div>
                ) : overview ? (
                  <OverviewMetrics overview={overview} />
                ) : (
                  <Card className="p-6">
                    <EmptyState
                      title="Overview unavailable"
                      description="Try refreshing this page."
                    />
                    <Button variant="secondary" onClick={() => window.location.reload()}>
                      Refresh
                    </Button>
                  </Card>
                )}
              </section>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, group]) => (
        <Card className="p-6" key={label}>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{group}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {value.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-sm text-slate-600">{label}</p>
        </Card>
      ))}
    </div>
  );
}
