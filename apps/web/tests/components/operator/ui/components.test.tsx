import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  OperatorActionsMenu,
  OperatorEmptyState,
  OperatorErrorState,
  OperatorFilterField,
  OperatorLoadingState,
  OperatorMetricCard,
  OperatorPage,
  OperatorPageHeader,
  OperatorPagination,
  OperatorPrimaryCell,
  OperatorSection,
  OperatorStatusBadge,
  OperatorTableSurface,
  OperatorToolbar,
  OperatorValueCell,
  operatorStatusTone,
} from "@/components/operator/ui";
import { operatorActionMenuItem } from "@/components/operator/ui/actions-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

describe("operator UI composition components", () => {
  it("renders page header content and actions with a compact readable hierarchy", () => {
    const html = renderToStaticMarkup(
      <OperatorPageHeader
        eyebrow="Account operations"
        title="Users"
        description="Search safe account projections and inspect referral context."
        actions={<Button>Export</Button>}
      />,
    );

    expect(html).toContain("Account operations");
    expect(html).toContain("<h2");
    expect(html).toContain("Users");
    expect(html).toContain("Search safe account projections");
    expect(html).toContain("Export</button>");
  });

  it("keeps toolbar controls in an accessible submitting form", () => {
    const html = renderToStaticMarkup(
      <OperatorToolbar
        actions={<Button type="submit">Search</Button>}
        onSubmit={(event) => event.preventDefault()}
      >
        <OperatorFilterField label="Username" htmlFor="username-filter">
          <Input id="username-filter" name="username" />
        </OperatorFilterField>
        <OperatorFilterField label="State" htmlFor="state-filter">
          <Select id="state-filter" name="state" aria-label="State">
            <option value="all">All states</option>
          </Select>
        </OperatorFilterField>
      </OperatorToolbar>,
    );

    expect(html).toContain('<form aria-label="Operator filters"');
    expect(html).toContain('for="username-filter"');
    expect(html).toContain('for="state-filter"');
    expect(html).toContain('type="submit"');
  });

  it("wraps semantic tables in an overflow-safe surface with optional framing", () => {
    const html = renderToStaticMarkup(
      <OperatorTableSurface header={<h3>Users</h3>} footer={<span>Showing 1 result</span>}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">User</TableHead>
              <TableHead scope="col">Referrals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>alpha_one</TableCell>
              <TableCell>4</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </OperatorTableSurface>,
    );

    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).toContain("alpha_one");
    expect(html).toContain("Showing 1 result");
  });

  it("provides accessible compact empty, error, and structured loading states", () => {
    const empty = renderToStaticMarkup(
      <OperatorEmptyState title="No users found" description="Try another username." />,
    );
    const error = renderToStaticMarkup(
      <OperatorErrorState message="The request failed." retry={vi.fn()} />,
    );
    const tableLoading = renderToStaticMarkup(
      <OperatorLoadingState variant="table" rows={2} columns={3} />,
    );
    const toolbarLoading = renderToStaticMarkup(<OperatorLoadingState variant="toolbar" />);
    const sectionLoading = renderToStaticMarkup(<OperatorLoadingState variant="section" />);

    expect(empty).toContain('role="status"');
    expect(empty).toContain("No users found");
    expect(error).toContain('role="alert"');
    expect(error).toContain("The request failed.");
    expect(tableLoading).toContain('aria-busy="true"');
    expect(tableLoading).toContain("<table");
    expect(toolbarLoading).toContain("Loading operator data");
    expect(sectionLoading).toContain("Loading operator data");
  });

  it("maps status language to shared tones and keeps unknown labels neutral", () => {
    expect(operatorStatusTone("Confirmed")).toBe("success");
    expect(operatorStatusTone("verification-pending")).toBe("warning");
    expect(operatorStatusTone("Rejected")).toBe("danger");
    expect(operatorStatusTone("Processing")).toBe("info");
    expect(operatorStatusTone("Unusual operational state")).toBe("neutral");
    expect(
      renderToStaticMarkup(<OperatorStatusBadge status="rejected" label="Rejected" />),
    ).toContain("Rejected");
  });

  it("uses readable primary cells, tabular values, compact metric cards, and cursor controls", () => {
    const cell = renderToStaticMarkup(
      <>
        <OperatorPrimaryCell title="central_user" subtitle="central_user@example.test" />
        <OperatorValueCell>1,204</OperatorValueCell>
        <OperatorMetricCard label="Accounts" value="1,204" category="Identity" />
        <OperatorPagination
          hasPrevious={false}
          hasNext
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          summary="25 results on this page"
        />
      </>,
    );

    expect(cell).toContain("central_user@example.test");
    expect(cell).toContain("tabular-nums");
    expect(cell).toContain("Identity");
    expect(cell).toContain("25 results on this page");
    expect(cell).toContain('aria-label="Operator result pages"');
    expect(cell).toContain('disabled=""');
  });

  it("uses the accessible Radix-backed row action menu trigger", () => {
    const html = renderToStaticMarkup(
      <OperatorActionsMenu
        label="Actions for alpha_one"
        actions={[{ type: "action", label: "Refresh account", onSelect: vi.fn() }]}
      />,
    );

    expect(html).toContain('aria-label="Actions for alpha_one"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("renders link and callback actions with destructive and disabled semantics", () => {
    const action = vi.fn();
    const link = operatorActionMenuItem({
      type: "link",
      label: "Edit account",
      href: "/operator/users/1/edit",
    });
    const destructive = operatorActionMenuItem({
      type: "action",
      label: "Deactivate",
      destructive: true,
      onSelect: action,
    });
    const disabled = operatorActionMenuItem({
      type: "action",
      label: "Unavailable",
      disabled: true,
      onSelect: action,
    });

    expect(link.props.asChild).toBe(true);
    expect(link.props.children.props.href).toBe("/operator/users/1/edit");
    expect(destructive.props.className).toContain("text-red-700");
    destructive.props.onSelect();
    expect(action).toHaveBeenCalledOnce();
    expect(disabled.props.disabled).toBe(true);
  });

  it("composes a representative dense Users page without introducing a public route", () => {
    const html = renderToStaticMarkup(
      <OperatorPage>
        <OperatorPageHeader
          eyebrow="Account operations"
          title="Users"
          description="Search safe account projections and inspect referral context."
        />
        <OperatorToolbar actions={<Button type="submit">Search</Button>}>
          <OperatorFilterField label="Username" htmlFor="user-search">
            <Input id="user-search" placeholder="Search usernames" />
          </OperatorFilterField>
          <OperatorFilterField label="State" htmlFor="user-state">
            <Select id="user-state" aria-label="State">
              <option>All states</option>
            </Select>
          </OperatorFilterField>
        </OperatorToolbar>
        <OperatorSection title="Users" description="1 account">
          <OperatorTableSurface>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <OperatorPrimaryCell title="alpha_one" subtitle="alpha@example.test" />
                  </TableCell>
                  <TableCell>
                    <OperatorStatusBadge status="active" label="Active" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </OperatorTableSurface>
        </OperatorSection>
      </OperatorPage>,
    );

    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain("Account operations");
    expect(html).toContain("Users");
    expect(html).toContain("Search usernames");
    expect(html).toContain("alpha@example.test");
    expect(html).toContain("<table");
    expect(html).toContain("Active");
  });
});
