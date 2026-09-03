"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

type SidebarContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("Sidebar components must be used within SidebarProvider");
  return context;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        {children}
      </Sheet>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className }: React.HTMLAttributes<HTMLElement>) {
  const { setMobileOpen } = useSidebar();
  const content = <div className="flex min-h-full flex-col gap-8">{children}</div>;
  return (
    <>
      <aside
        data-sidebar="sidebar"
        className={cn(
          "hidden w-64 shrink-0 border-r border-slate-200 bg-[#f1f4ef] lg:block",
          className,
        )}
      >
        {content}
      </aside>
      <SheetContent
        side="left"
        className={cn("w-[min(82vw,280px)] bg-[#f1f4ef] p-6", className)}
        onCloseAutoFocus={() => setMobileOpen(false)}
      >
        <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
        {content}
      </SheetContent>
    </>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-0", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-4", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("grid gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={className} {...props} />;
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const { setMobileOpen } = useSidebar();
  const classes = cn(
    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
    isActive ? "bg-emerald-100 font-semibold text-emerald-900" : "text-slate-600",
    className,
  );
  if (asChild) {
    return (
      <Slot className={classes} onClick={() => setMobileOpen(false)}>
        {children}
      </Slot>
    );
  }
  return (
    <button type="button" className={classes} onClick={() => setMobileOpen(false)} {...props}>
      {children}
    </button>
  );
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <SheetTrigger asChild>
      <Button variant="outline" size="sm" className={cn("lg:hidden", className)} {...props}>
        <Menu className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Open dashboard navigation</span>
      </Button>
    </SheetTrigger>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1", className)} {...props} />;
}
