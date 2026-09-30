import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  crudTableRowPropsEqual,
  CrudTable,
  type CrudColumn,
  visibleSelection,
  visibleSelectionState,
} from "@/components/crud/table";

describe("shared CRUD table", () => {
  it("renders desktop semantic columns and mobile record fields from the same definitions", () => {
    type Record = { id: string; name: string; state: string };
    const columns: readonly CrudColumn<Record>[] = [
      { key: "name", label: "Name", primary: true, render: (record) => record.name },
      { key: "state", label: "State", render: (record) => record.state },
    ];
    const html = renderToStaticMarkup(
      <CrudTable
        items={[{ id: "r-1", name: "Long operator record", state: "active" }]}
        columns={columns}
        getRowKey={(item) => item.id}
        actions={() => [{ type: "link", label: "Inspect", href: "/operator/records/r-1" }]}
        actionLabel={() => "Record actions"}
      />,
    );

    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("hidden md:block");
    expect(html).toContain("md:hidden");
    expect(html).toContain("break-words");
    expect(html).toContain("bg-slate-100");
    expect(html).toContain("font-semibold text-slate-700");
    expect(html).toContain("even:bg-slate-50/70");
    expect(html).toContain("rounded-md");
    expect(html).toContain("space-y-3");
    expect(html).not.toContain("rounded-xl border border-slate-200 bg-white md:hidden");
    expect(html).toContain('<dt class="text-xs font-semibold text-slate-700">Name</dt>');
    expect(html).toContain(">Name</dt>");
    expect(html).toContain(">State</dt>");
    expect(html).toContain("py-3");
    expect(html.match(/Long operator record/g)).toHaveLength(2);
    expect(html.match(/active/g)).toHaveLength(2);
    expect(html.match(/Record actions/g)).toHaveLength(2);
  });

  it("keeps default values left-aligned on desktop and mobile with usable actions", () => {
    const html = renderToStaticMarkup(
      <CrudTable
        items={[{ id: "r-1", amount: "125.00" }]}
        columns={[{ key: "amount", label: "Amount", render: (item) => item.amount }]}
        getRowKey={(item) => item.id}
        actions={() => [{ type: "link", label: "Inspect", href: "/operator/records/r-1" }]}
      />,
    );

    const valueCell = html.match(/<td class="([^"]*)">125\.00<\/td>/)?.[1] ?? "";
    const mobileValue = html.match(/<dd class="([^"]*)">125\.00<\/dd>/)?.[1] ?? "";
    expect(valueCell).not.toContain("text-right");
    expect(mobileValue).not.toContain("text-right");
    expect(html).toContain("text-left");
    expect(html).toContain("Actions");
    expect(html).toContain('aria-label="Row actions"');
  });

  it("renders shared desktop and mobile selection controls for the same visible records", () => {
    const html = renderToStaticMarkup(
      <CrudTable
        items={[{ id: "r-1", name: "Ada" }]}
        columns={[{ key: "name", label: "Name", primary: true, render: (item) => item.name }]}
        getRowKey={(item) => item.id}
        selection={{
          selectedKeys: new Set(["r-1"]),
          onChange: () => {},
          labelForItem: (item) => item.name,
        }}
      />,
    );
    expect(html).toContain('aria-label="Select all visible records"');
    expect(html).toContain('aria-label="Select Ada"');
    expect(html.match(/aria-label="Select Ada"/g)).toHaveLength(2);
    expect(html).toMatch(/<th[^>]*>.*?Select all visible records/s);
  });

  it("selects and deselects exactly the visible cursor-page rows without a separate cap", () => {
    const visible = Array.from({ length: 37 }, (_, index) => ({ id: `row-${index}` }));
    const selectAll = visibleSelection(visible, (row) => row.id, new Set(), true);
    expect(selectAll.size).toBe(37);
    expect([...selectAll]).toEqual(visible.map((row) => row.id));
    expect(visibleSelection(visible, (row) => row.id, selectAll, false).size).toBe(0);
  });

  it("keeps select-all unchecked, indeterminate, or checked from the visible selection count", () => {
    expect(visibleSelectionState(3, 0)).toEqual({ allSelected: false, indeterminate: false });
    expect(visibleSelectionState(3, 1)).toEqual({ allSelected: false, indeterminate: true });
    expect(visibleSelectionState(3, 3)).toEqual({ allSelected: true, indeterminate: false });
    expect(visibleSelectionState(0, 0)).toEqual({ allSelected: false, indeterminate: false });
  });

  it("memoizes unaffected rows while rerendering the row whose selection changed", () => {
    const item = { id: "r-1", name: "Ada" };
    const columns: readonly CrudColumn<typeof item>[] = [
      { key: "name", label: "Name", render: (record) => record.name },
    ];
    const getRowKey = (record: typeof item) => record.id;
    const onToggle = () => {};
    const base = {
      item,
      desktopColumns: columns,
      getRowKey,
      selectionLabel: "Ada",
      selected: false,
      onToggle,
    };

    expect(crudTableRowPropsEqual(base, { ...base })).toBe(true);
    expect(crudTableRowPropsEqual(base, { ...base, selected: true })).toBe(false);
    expect(crudTableRowPropsEqual(base, { ...base, item: { id: "r-1", name: "Ada" } })).toBe(false);
  });

  it("does not render selection controls when the resource has no bulk actions", () => {
    const html = renderToStaticMarkup(
      <CrudTable
        items={[{ id: "read-only" }]}
        columns={[{ key: "id", label: "ID", render: (item) => item.id }]}
        getRowKey={(item) => item.id}
      />,
    );
    expect(html).not.toContain("Select all visible records");
    expect(html).not.toContain('type="checkbox"');
  });
});
