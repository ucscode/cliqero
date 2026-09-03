"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ChevronDown, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";

export function SiteHeader() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  async function logout() {
    await authClient.signOut();
    router.refresh();
    router.push("/");
  }
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f7f8f4]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-8">
        <Link href="/" className="brand">
          <span className="brand-mark">C</span>
          <span>cliqero</span>
        </Link>
        <nav
          className="ml-auto hidden items-center gap-6 text-sm text-slate-500 md:flex"
          aria-label="Primary navigation"
        >
          <Link href="/">Catalogue</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/about">About</Link>
          {user && <Link href="/dashboard">Dashboard</Link>}
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>Site navigation</SheetTitle>
            <nav className="mt-6 grid gap-4 text-base" aria-label="Mobile navigation">
              <Link href="/">Catalogue</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/about">About</Link>
            </nav>
          </SheetContent>
        </Sheet>
        <div className="ml-4 flex items-center gap-3">
          {session.isPending ? (
            <span
              className="h-3 w-7 animate-pulse rounded-full bg-slate-200"
              aria-label="Loading account"
            />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
                  aria-label="Open account menu"
                >
                  {user.name || "Account"}
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard?section=profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void logout()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link
                className="hidden text-sm font-medium text-slate-600 hover:text-emerald-700 sm:inline"
                href="/login"
              >
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link href="/register">Join Cliqero</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
