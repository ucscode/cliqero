import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorUsersListView } from "@/components/operator/users";
import type { OperatorAccountPage } from "@/lib/api-client";

const page: OperatorAccountPage = {
  items: [
    {
      id: "account-reviewer-three",
      username: "reviewer_three",
      displayName: "Reviewer Three",
      email: "reviewer.three@example.test",
      country: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      directReferralCount: 0,
    },
    {
      id: "account-gamma-one",
      username: "gamma_one",
      displayName: null,
      email: null,
      country: "NG",
      createdAt: "2026-01-01T00:00:00.000Z",
      directReferralCount: 3,
    },
  ],
  nextCursor: "cursor-next",
};

function renderUsers(overrides: Partial<Parameters<typeof OperatorUsersListView>[0]> = {}) {
  return renderToStaticMarkup(
    <OperatorUsersListView
      page={page}
      search="gamma"
      loading={false}
      error={null}
      onSearchChange={vi.fn()}
      onSearch={vi.fn()}
      onRetry={vi.fn()}
      onNext={vi.fn()}
      {...overrides}
    />,
  );
}

describe("operator users list", () => {
  it("uses the shared page, header, and manual account-search toolbar", () => {
    const html = renderUsers();

    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain("Account operations");
    expect(html).toContain("Search safe account projections and inspect referral context.");
    expect(html).toContain('<form aria-label="Operator filters"');
    expect(html).toContain('for="operator-user-search"');
    expect(html).toContain('id="operator-user-search"');
    expect(html).toContain('placeholder="Username, email, or account ID"');
    expect(html).toContain(">Search</button>");
  });

  it("renders account fields as separate semantic table columns", () => {
    const html = renderUsers();
    const headers = Array.from(html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g), (match) => match[1]);

    expect(html).toContain("<table");
    expect(headers).toEqual(["User", "Email", "Direct referrals", "Country", "Action"]);
    expect(html).toContain("@reviewer_three");
    expect(html).toContain("Reviewer Three");
    expect(html).toContain("reviewer.three@example.test");
    expect(html).toContain("No authentication email");
    expect(html).toContain(">3</span>");
    expect(html).toContain(">NG</span>");
    expect(html).toContain(">—</span>");
    expect(html).toContain('href="/operator/users/account-reviewer-three"');
    expect(html).toContain('href="/operator/network?root=account-gamma-one"');
    expect(html).toContain("View network");
    expect(html).not.toContain("Country not set");
    expect(html).not.toContain("reviewer_threereviewer.three@example.test");
  });

  it("keeps forward cursor pagination and does not imply numbered pages", () => {
    const html = renderUsers();

    expect(html).toContain('aria-label="Operator result pages"');
    expect(html).toContain("Showing 2 users");
    expect(html).toContain(">Previous</button>");
    expect(html).toContain(">Next</button>");
    expect(html).not.toContain("Page 1");
    expect(html).not.toContain("1 2 3");
  });

  it("uses the shared table loading, empty, and retryable error states", () => {
    const loading = renderUsers({ loading: true });
    const empty = renderUsers({ page: { items: [], nextCursor: null } });
    const failed = renderUsers({ page: null, error: "Account service unavailable." });

    expect(loading).toContain('aria-label="Loading users"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("<table");
    expect(empty).toContain('role="status"');
    expect(empty).toContain("No users found");
    expect(empty).toContain("Try a different username, email, or account ID.");
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Account service unavailable.");
    expect(failed).toContain("Try again");
  });
});
