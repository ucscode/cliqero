import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrudConfigurationProvider, useCrudMaxRows } from "@/components/crud/configuration";
import { resolveCrudMaxRows } from "@/components/crud/max-rows";

function MaxRowsProbe({ override }: { override?: number }) {
  return <span>{useCrudMaxRows(override)}</span>;
}

describe("CRUD maxRows configuration", () => {
  it("uses the server-provided site default without a configuration API request", () => {
    const html = renderToStaticMarkup(
      <CrudConfigurationProvider maxRows={37}>
        <MaxRowsProbe />
      </CrudConfigurationProvider>,
    );
    expect(html).toContain(">37</span>");
  });

  it("supports a component-level override", () => {
    const html = renderToStaticMarkup(
      <CrudConfigurationProvider maxRows={50}>
        <MaxRowsProbe override={25} />
      </CrudConfigurationProvider>,
    );
    expect(html).toContain(">25</span>");
  });

  it.each([0, -1, 1.5, 201])("rejects an invalid collection override %s", (override) => {
    expect(() => resolveCrudMaxRows(50, override)).toThrow(
      "CRUD maxRows must be an integer between 1 and 200",
    );
  });

  it("validates and retains the site-provided default when no override is supplied", () => {
    expect(resolveCrudMaxRows(37)).toBe(37);
    expect(() => resolveCrudMaxRows(201)).toThrow(
      "CRUD maxRows must be an integer between 1 and 200",
    );
  });
});
