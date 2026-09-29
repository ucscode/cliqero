import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  dashboardSlowMessageVisible,
  DASHBOARD_SLOW_LOADING_MS,
  DashboardLoadingState,
  DashboardSlowLoadingNotice,
} from "@/components/dashboard/loading";

describe("dashboard boot loading state", () => {
  it.each([
    ["session", "Loading your dashboard…", "Checking your session."],
    ["account", "Preparing your account…", "Loading your Cliqero workspace."],
  ] as const)("communicates the %s stage with dashboard-shaped progress", (stage, title, copy) => {
    const markup = renderToStaticMarkup(<DashboardLoadingState stage={stage} />);
    expect(markup).toContain("Cliqero");
    expect(markup).toContain(title);
    expect(markup).toContain(copy);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("animate-spin");
    expect(markup).toContain("animate-pulse");
    expect(markup).not.toContain("h-48 w-full");
    expect(markup).not.toContain("Better Auth");
    expect(markup).not.toContain("canonical principal");
  });

  it("announces a slow connection after ten seconds without ending the pending request", () => {
    expect(DASHBOARD_SLOW_LOADING_MS).toBe(10_000);
    expect(dashboardSlowMessageVisible(9_999)).toBe(false);
    expect(dashboardSlowMessageVisible(10_000)).toBe(true);
    expect(dashboardSlowMessageVisible(20_000)).toBe(true);
  });

  it("offers retry only when a caller supplies a meaningful retry operation", () => {
    const withRetry = renderToStaticMarkup(<DashboardSlowLoadingNotice onRetry={vi.fn()} />);
    const withoutRetry = renderToStaticMarkup(<DashboardSlowLoadingNotice />);
    expect(withRetry).toContain("Try again");
    expect(withoutRetry).not.toContain("Try again");
  });

  it("uses the shared component for suspense and both session-pending paths", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/shell.tsx"),
      "utf8",
    );
    expect(page).toMatch(/<Suspense fallback=\{<DashboardLoadingState stage="session" \/>}\s*>/);
    expect(shell).toContain("session.isPending");
    expect(shell).toContain(
      '<DashboardLoadingState stage="session" onRetry={() => refetchSession()} />',
    );
    expect(shell).toContain(
      '<DashboardLoadingState stage="account" onRetry={verifyCanonicalSession} />',
    );
    expect(shell).toContain("authClient.signOut()");
    expect(shell).toContain('router.replace("/login")');
    expect(shell).toContain('title="We couldn’t verify your account"');
    expect(shell).toContain("onClick={() => void verifyCanonicalSession()}");
  });
});
