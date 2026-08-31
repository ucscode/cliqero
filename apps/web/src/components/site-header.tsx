"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Menu } from "./ui";

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
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">C</span>
          <span>cliqero</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/">Discover</Link>
          {user && <Link href="/dashboard">Dashboard</Link>}
        </nav>
        <div className="header-actions">
          {session.isPending ? (
            <span className="header-loading" aria-label="Loading account" />
          ) : user ? (
            <Menu label={user.name || "Account"}>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/dashboard?section=profile">Profile</Link>
              <button onClick={logout}>Sign out</button>
            </Menu>
          ) : (
            <>
              <Link className="text-link hide-mobile" href="/login">
                Sign in
              </Link>
              <Link className="button button-small" href="/register">
                Join Cliqero
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
