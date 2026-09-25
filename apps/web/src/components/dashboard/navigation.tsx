"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { AccountAccess } from "@/lib/api-client";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

const navigation = [
  { label: "Overview", href: "/dashboard", section: "overview" },
  { label: "Catalogue", href: "/catalogue", section: "catalogue" },
  { label: "Wallet", href: "/dashboard?section=wallet", section: "wallet" },
  { label: "Purchases", href: "/dashboard?section=purchases", section: "purchases" },
  { label: "Promote", href: "/dashboard?section=promote", section: "promote" },
  { label: "Hierarchy", href: "/dashboard?section=hierarchy", section: "hierarchy" },
  { label: "Referrals", href: "/dashboard?section=referrals", section: "referrals" },
  { label: "Earnings", href: "/dashboard?section=earnings", section: "earnings" },
  { label: "Withdrawals", href: "/dashboard?section=withdrawals", section: "withdrawals" },
  {
    label: "Payout Methods",
    href: "/dashboard?section=payout-methods",
    section: "payout-methods",
  },
  { label: "Settings", href: "/dashboard?section=settings", section: "settings" },
];

const primaryNavigation = navigation.filter((item) =>
  ["overview", "catalogue", "purchases"].includes(item.section),
);
const moneyNavigation = navigation.filter((item) =>
  ["wallet", "earnings", "withdrawals", "payout-methods"].includes(item.section),
);
const referralNavigation = navigation.filter((item) =>
  ["promote", "hierarchy", "referrals"].includes(item.section),
);

const dashboardSections = new Set([
  "overview",
  "wallet",
  "purchases",
  "promote",
  "hierarchy",
  "referrals",
  "earnings",
  "withdrawals",
  "payout-methods",
  "settings",
]);

export function resolveDashboardSection(
  section: string | null,
  hasBuy: boolean,
  mode: {
    payoutMethodForm?: boolean;
    withdrawalHistory?: boolean;
    walletFunding?: boolean;
    fundingHistory?: boolean;
  } = {},
) {
  if (mode.payoutMethodForm) return "payout-methods";
  if (mode.withdrawalHistory) return "withdrawals";
  if (mode.walletFunding || mode.fundingHistory) return "wallet";
  if (section === null) return hasBuy ? "checkout" : "overview";
  return dashboardSections.has(section) ? section : "overview";
}

export function dashboardSectionTitle(section: string) {
  return navigation.find((item) => item.section === section)?.label ?? "Overview";
}

export function resolveNavigationGroupOpen(active: boolean, manualOpen: boolean | null) {
  return manualOpen ?? active;
}

export function nextNavigationGroupOpen(active: boolean, manualOpen: boolean | null) {
  return !resolveNavigationGroupOpen(active, manualOpen);
}

export function DashboardNavigation({
  accountAccess,
  section,
}: {
  accountAccess: AccountAccess | null;
  section: string;
}) {
  return (
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
          <DashboardNavGroup
            key={`Money-${section}`}
            label="Money"
            items={moneyNavigation}
            section={section}
          />
          <DashboardNavGroup
            key={`Referrals-${section}`}
            label="Referrals"
            items={referralNavigation}
            section={section}
          />
          <SidebarMenuItem className="mt-2 border-t border-slate-200 pt-2">
            <SidebarMenuButton asChild isActive={section === "settings"} className="font-medium">
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
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = resolveNavigationGroupOpen(active, manualOpen);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        className={active ? "bg-emerald-50 font-semibold text-emerald-900" : undefined}
        aria-expanded={open}
        onClick={() => setManualOpen((value) => nextNavigationGroupOpen(active, value))}
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
