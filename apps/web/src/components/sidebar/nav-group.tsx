"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

export type SidebarNavItem = { key: string; href: string; label: string };

export function resolveSidebarGroupOpen(active: boolean, manualOpen: boolean | null) {
  return manualOpen ?? active;
}

export function toggleSidebarGroupOpen(active: boolean, manualOpen: boolean | null) {
  return !resolveSidebarGroupOpen(active, manualOpen);
}

export function SidebarNavGroup({
  label,
  items,
  activeKey,
}: {
  label: string;
  items: readonly SidebarNavItem[];
  activeKey: string;
}) {
  const active = items.some((item) => item.key === activeKey);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = resolveSidebarGroupOpen(active, manualOpen);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        className={active ? "bg-emerald-50 font-semibold text-emerald-900" : undefined}
        aria-expanded={open}
        onClick={() => setManualOpen((current) => toggleSidebarGroupOpen(active, current))}
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
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton asChild isActive={activeKey === item.key}>
                <Link href={item.href}>{item.label}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarMenuItem>
  );
}
