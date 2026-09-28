import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrudIndex } from "@/components/operator/crud/index-page";

const columns = [
  { key: "name", label: "Name", render: (item: { id: string; name: string }) => item.name },
];

function render(
  overrides: Partial<Parameters<typeof CrudIndex<{ id: string; name: string }>>[0]> = {},
) {
  return renderToStaticMarkup(
    <CrudIndex
      title="Records"
      items={[]}
      columns={columns}
      getRowKey={(item) => item.id}
      loading={false}
      error={null}
      emptyTitle="Nothing here"
      emptyDescription="Create a record to get started."
      {...overrides}
    />,
  );
}

describe("operator CRUD index", () => {
  it("does not repeat the page title as a collection heading", () => {
    const page = render({ title: "Records", sectionTitle: "Records" });
    expect(page).toContain(">Records</h2>");
    expect(page).not.toContain(">Records</h3>");
  });

  it("keeps a distinct collection heading when it adds context", () => {
    const page = render({ title: "Records", sectionTitle: "Recently updated" });
    expect(page).toContain("Recently updated");
  });

  it("keeps the matching collection heading when it has a section description", () => {
    const page = render({
      title: "Records",
      sectionTitle: "Records",
      sectionDescription: "Latest records from the system.",
    });
    expect(page).toContain("Latest records from the system.");
    expect(page).toContain(">Records</h2>");
    expect(page).toContain(">Records</h3>");
  });

  it("provides standard loading, error/retry, empty, filter/sort/action and pagination slots", () => {
    const loading = render({ loading: true });
    expect(loading).toContain("Loading");

    const failed = render({ error: "Read failed", onRetry: vi.fn() });
    expect(failed).toContain("Read failed");
    expect(failed).toContain("Try again");

    const empty = render();
    expect(empty).toContain("Nothing here");
    expect(empty).toContain("Create a record to get started.");

    const page = render({
      createAction: { label: "Add record", href: "/operator/records/new" },
      filters: (
        <label>
          Search
          <input aria-label="Search" />
        </label>
      ),
      sort: (
        <label>
          Sort by
          <input aria-label="Sort by" />
        </label>
      ),
      toolbarActions: <button type="button">Export</button>,
      onFiltersSubmit: (event) => event.preventDefault(),
      beforeTable: <p>Summary slot</p>,
      afterTable: <p>After table slot</p>,
      footer: <p>Footer slot</p>,
      items: [{ id: "1", name: "Ada" }],
      pagination: { hasPrevious: true, hasNext: false, onPrevious: vi.fn(), onNext: vi.fn() },
    });
    expect(page).toContain("Search");
    expect(page).toContain("Add record");
    expect(page).toContain("Sort by");
    expect(page).toContain("Export");
    expect(page).toContain("Summary slot");
    expect(page).toContain("After table slot");
    expect(page).toContain("Footer slot");
    expect(page).toContain("Ada");
    expect(page).toContain('aria-label="Operator result pages"');
  });
});
