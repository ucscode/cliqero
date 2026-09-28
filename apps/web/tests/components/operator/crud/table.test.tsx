import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrudTable, type CrudColumn } from "@/components/operator/crud/table";

describe("operator CRUD table", () => {
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
    expect(html).toContain(">Name</dt>");
    expect(html).toContain(">State</dt>");
    expect(html.match(/Long operator record/g)).toHaveLength(2);
    expect(html.match(/active/g)).toHaveLength(2);
    expect(html.match(/Record actions/g)).toHaveLength(2);
  });
});
