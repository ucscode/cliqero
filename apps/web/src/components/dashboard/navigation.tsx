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
    label: "Withdrawal methods",
    href: "/dashboard?section=withdrawal-methods",
    section: "withdrawal-methods",
  },
  { label: "Settings", href: "/dashboard?section=settings", section: "settings" },
];

const primaryNavigation = navigation.filter((item) =>
  ["overview", "catalogue", "purchases"].includes(item.section),
);
const moneyNavigation = navigation.filter((item) =>
  ["wallet", "earnings", "withdrawals", "withdrawal-methods"].includes(item.section),
);
const referralNavigation = navigation.filter((item) =>
  ["promote", "hierarchy", "referrals"].includes(item.section),
);

export function dashboardSectionTitle(section: string) {
  return navigation.find((item) => item.section === section)?.label ?? "Dashboard";
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
          <DashboardNavGroup label="Money" items={moneyNavigation} section={section} />
          <DashboardNavGroup label="Referrals" items={referralNavigation} section={section} />
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
