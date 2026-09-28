"use client";

import Link from "next/link";
import { Badge } from "../ui/badge";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type OperatorOverview } from "@/lib/api-client";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../ui/sidebar";
import { BrandLink } from "../brand-identity";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorEmptyState } from "./ui/empty-state";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { SidebarNavGroup, type SidebarNavItem } from "../sidebar/nav-group";

export function OperatorShell({
  capabilities,
  username,
  email,
  activeSection = "overview",
  children,
}: {
  capabilities: readonly Capability[];
  username: string;
  email: string | null;
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
    | "blog"
    | "blogCategories"
    | "reviews";
  children?: ReactNode;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const overviewEnabled = children === undefined || children === null;

  useEffect(() => {
    if (!overviewEnabled) return;
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
  }, [overviewEnabled]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  const navigation = [
    { key: "overview", href: "/operator", label: "Overview", visible: true },
    {
      key: "users",
      href: "/operator/users",
      label: "Users",
      visible:
        hasCapability(capabilities, "accounts.read") ||
        hasCapability(capabilities, "accounts.manage"),
    },
    {
      key: "network",
      href: "/operator/network",
      label: "Network",
      visible: hasCapability(capabilities, "hierarchy.manage"),
    },
  ];
  const groups: Array<{ label: string; items: Array<SidebarNavItem & { visible?: boolean }> }> = [
    {
      label: "Catalogue",
      items: [
        ...(hasCapability(capabilities, "catalogue.manage")
          ? [{ key: "catalogue", href: "/operator/catalogue", label: "Listings" }]
          : []),
        ...(hasCapability(capabilities, "reviews.moderate")
          ? [{ key: "reviews", href: "/operator/reviews", label: "Reviews" }]
          : []),
      ],
    },
    {
      label: "Finance",
      items: [
        {
          key: "funding",
          href: "/operator/funding",
          label: "Funding",
          visible: hasCapability(capabilities, "finance.read"),
        },
        {
          key: "distributions",
          href: "/operator/distributions",
          label: "Distributions",
          visible: hasCapability(capabilities, "finance.read"),
        },
        {
          key: "earnings",
          href: "/operator/earnings",
          label: "Earnings",
          visible: hasCapability(capabilities, "finance.read"),
        },
        {
          key: "withdrawals",
          href: "/operator/withdrawals",
          label: "Withdrawals",
          visible: hasCapability(capabilities, "withdrawals.manage"),
        },
        {
          key: "treasury",
          href: "/operator/treasury",
          label: "Treasury",
          visible: hasCapability(capabilities, "treasury.manage"),
        },
      ],
    },
    {
      label: "Blog",
      items: [
        {
          key: "blog",
          href: "/operator/blog",
          label: "Posts",
          visible: hasCapability(capabilities, "content.manage"),
        },
        {
          key: "blogCategories",
          href: "/operator/blog/categories",
          label: "Categories",
          visible: hasCapability(capabilities, "content.manage"),
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !("visible" in item) || item.visible !== false)
        .map(({ key, href, label }) => ({ key, href, label })),
    }))
    .filter((group) => group.items.length);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50">
        <Sidebar>
          <SidebarHeader>
            <BrandLink className="text-slate-900" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu id="operator-navigation" aria-label="Operator navigation">
                {navigation
                  .filter((item) => item.key === "overview" && item.visible)
                  .map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={activeSection === item.key}>
                        <Link href={item.href}>{item.label}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                {groups
                  .filter((group) => group.label === "Catalogue")
                  .map((group) => (
                    <SidebarNavGroup
                      key={`${group.label}-${activeSection}`}
                      label={group.label}
                      items={group.items}
                      activeKey={activeSection}
                    />
                  ))}
                {navigation
                  .filter((item) => item.key !== "overview" && item.visible)
                  .map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={activeSection === item.key}>
                        <Link href={item.href}>{item.label}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                {groups
                  .filter((group) => group.label !== "Catalogue")
                  .map((group) => (
                    <SidebarNavGroup
                      key={`${group.label}-${activeSection}`}
                      label={group.label}
                      items={group.items}
                      activeKey={activeSection}
                    />
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
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-white/95 px-4 backdrop-blur lg:px-8">
            <SidebarTrigger aria-label="Open operator navigation" />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="ml-auto inline-flex items-center gap-2 px-2 py-1.5"
                  aria-label="Open operator account menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">
                    {username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{username}</span>
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
          <main className="min-w-0 p-4 lg:p-8">
            <div className="mx-auto w-full max-w-[1600px] space-y-6">
              {children ?? (
                <OperatorPage>
                  <OperatorPageHeader
                    eyebrow={
                      hasCapability(capabilities, "system.root")
                        ? "Platform operations"
                        : "Authorized operations"
                    }
                    title={
                      hasCapability(capabilities, "system.root")
                        ? "A clear view of the platform"
                        : "A focused operational view"
                    }
                    description="Authoritative operational counts from Cliqero services."
                    actions={
                      <Badge variant="default">
                        {hasCapability(capabilities, "system.root")
                          ? "Full operator access"
                          : "Direct capabilities"}
                      </Badge>
                    }
                  />
                  {error && (
                    <OperatorErrorState message={error} retry={() => window.location.reload()} />
                  )}
                  {loading ? (
                    <OperatorLoadingState variant="section" label="Loading operator overview" />
                  ) : overview ? (
                    <OverviewMetrics overview={overview} />
                  ) : (
                    <OperatorEmptyState
                      title="Overview unavailable"
                      description="Try refreshing this page."
                    />
                  )}
                </OperatorPage>
              )}
            </div>
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
        <OperatorMetricCard
          key={label}
          label={label}
          value={value.toLocaleString("en-US")}
          category={group}
        />
      ))}
    </div>
  );
}
