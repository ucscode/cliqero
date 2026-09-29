import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OperatorUserFormFields,
  OperatorUsersListView,
  operatorUsersEmptyDescription,
  operatorUserRowActions,
} from "@/components/operator/users";
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
      appliedSearch="gamma"
      loading={false}
      error={null}
      onSearchChange={vi.fn()}
      onSearch={vi.fn()}
      onRetry={vi.fn()}
      hasPrevious={false}
      onPrevious={vi.fn()}
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
    expect(headers).toEqual(["User", "Email", "Direct referrals", "Country", "Actions"]);
    expect(html).toContain("@reviewer_three");
    expect(html).toContain("Reviewer Three");
    expect(html).toContain("reviewer.three@example.test");
    expect(html).toContain("No authentication email");
    expect(html).toContain(">3</span>");
    expect(html).toContain(">NG</span>");
    expect(html).toContain(">—</span>");
    expect(html).toContain('href="/operator/users/account-reviewer-three"');
    expect(html).toContain('aria-label="Actions for @gamma_one"');
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

  it("exposes real previous navigation only when cursor history has a prior page", () => {
    const firstPage = renderUsers({ hasPrevious: false });
    const laterPage = renderUsers({ hasPrevious: true, page: { ...page, nextCursor: null } });

    expect(firstPage).toContain('aria-label="Operator result pages"');
    expect(firstPage).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(laterPage).toContain('aria-label="Operator result pages"');
    expect(laterPage).toContain(">Previous</button>");
    expect(laterPage).toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
    expect(laterPage).not.toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  });

  it("keeps email editable only for creation and excludes credentials and immutable fields", () => {
    const callbacks = {
      onUsernameChange: vi.fn(),
      onEmailChange: vi.fn(),
      onCountryChange: vi.fn(),
    };
    const create = renderToStaticMarkup(
      <OperatorUserFormFields create username="" email="" country="" {...callbacks} />,
    );
    const edit = renderToStaticMarkup(
      <OperatorUserFormFields
        create={false}
        username="alpha"
        email="alpha@example.test"
        country="NG"
        {...callbacks}
      />,
    );

    expect(create).toContain('type="email"');
    expect(edit).toContain("Email (managed by account holder)");
    expect(edit).toContain('readOnly=""');
    expect(edit).toContain('disabled=""');
    expect(create + edit).not.toContain('type="password"');
    expect(edit).not.toContain('name="email"');
  });

  it("shows Create only with account-management authority and builds permitted row actions", () => {
    const readOnlyHtml = renderUsers();
    const managerHtml = renderUsers({ canManage: true });
    const account = page.items[0];

    expect(readOnlyHtml).not.toContain("Add user");
    expect(managerHtml).toContain("Add user");
    expect(
      operatorUserRowActions(account, false).map((action) => [action.label, action.href]),
    ).toEqual([
      ["View account", "/operator/users/account-reviewer-three"],
      ["View network", "/operator/network?root=account-reviewer-three"],
    ]);
    expect(operatorUserRowActions(account, true).map((action) => action.label)).toEqual([
      "View account",
      "Edit account",
      "View network",
    ]);
  });

  it("uses the shared table loading, empty, and retryable error states", () => {
    const loading = renderUsers({ loading: true, page: null });
    const empty = renderUsers({ page: { items: [], nextCursor: null } });
    const failed = renderUsers({ page: null, error: "Account service unavailable." });

    expect(loading).toContain('aria-label="Loading users"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("<table");
    expect(empty).toContain('role="status"');
    expect(empty).toContain("No users found");
    expect(empty).toContain("No accounts matched this search.");
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Account service unavailable.");
    expect(failed).toContain("Try again");
  });

  it("shows returned users immediately after collection initialization", () => {
    const html = renderUsers({ page, appliedSearch: "", search: "" });
    expect(html).toContain("@reviewer_three");
    expect(html).toContain("@gamma_one");
    expect(html).not.toContain("Loading users");
  });

  it("keeps empty wording tied to applied search, not the editable draft", () => {
    const draftOnly = renderUsers({
      page: { items: [], nextCursor: null },
      search: "central_left_1",
      appliedSearch: "",
    });
    const appliedQuery = renderUsers({
      page: { items: [], nextCursor: null },
      search: "",
      appliedSearch: "central_left_1",
    });

    expect(draftOnly).toContain("No accounts are available yet.");
    expect(draftOnly).not.toContain("No accounts matched this search.");
    expect(appliedQuery).toContain("No accounts matched this search.");
    expect(appliedQuery).not.toContain("No accounts are available yet.");
    expect(operatorUsersEmptyDescription("")).toBe("No accounts are available yet.");
    expect(operatorUsersEmptyDescription("central_left_1")).toBe(
      "No accounts matched this search.",
    );
  });
});
