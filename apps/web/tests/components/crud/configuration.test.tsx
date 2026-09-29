import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrudConfigurationProvider, useCrudMaxRows } from "@/components/crud/configuration";

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
});
