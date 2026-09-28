import { renderToStaticMarkup } from "react-dom/server";
import type { FormEvent } from "react";
import { describe, expect, it } from "vitest";
import { CrudDetail } from "@/components/operator/crud/detail";
import { CrudEdit } from "@/components/operator/crud/edit";

describe("operator CRUD detail", () => {
  it("renders read-only fields, actions, custom sections, and safely wraps long identifiers", () => {
    const id = "account-" + "a".repeat(80);
    const html = renderToStaticMarkup(
      <CrudDetail
        title="Ada"
        description="@ada"
        headerActions={<a href="/operator/users/ada/edit">Edit account</a>}
        fields={[
          { label: "Account ID", value: id },
          { label: "Country", value: "NG" },
        ]}
        beforeDetails={<p>Context before</p>}
        afterDetails={<p>Context after</p>}
        sidebar={<p>Operational sidebar</p>}
        sections={<section>Capability section</section>}
        footer={<p>Audit footer</p>}
      />,
    );

    expect(html).toContain("Edit account");
    expect(html).toContain("Account ID");
    expect(html).toContain("break-words");
    expect(html).toContain(id);
    expect(html).toContain("Context before");
    expect(html).toContain("Context after");
    expect(html).toContain("Operational sidebar");
    expect(html).toContain("Capability section");
    expect(html).toContain("Audit footer");
    expect(html).not.toContain("<input");
  });

  it("centralizes detail loading and error states", () => {
    expect(renderToStaticMarkup(<CrudDetail title="Funding" loading />)).toContain(
      "Loading Funding",
    );
    expect(
      renderToStaticMarkup(<CrudDetail title="Funding" error={{ message: "Not found" }} />),
    ).toContain("Not found");
  });
});

describe("operator CRUD edit", () => {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();

  it("supports create and edit shells with resource slots and custom actions", () => {
    for (const mode of ["create", "edit"] as const) {
      const html = renderToStaticMarkup(
        <CrudEdit
          mode={mode}
          title={mode === "create" ? "Add user" : "Edit user"}
          backHref="/operator/users"
          saving={false}
          onSubmit={onSubmit}
          headerActions={<button type="button">View network</button>}
          beforeFields={<p>Before fields</p>}
          afterFields={<p>After fields</p>}
          sidebar={<aside>Sidebar slot</aside>}
          footer={<p>Form footer</p>}
        >
          <label>
            Name
            <input name="name" />
          </label>
        </CrudEdit>,
      );
      expect(html).toContain(mode === "create" ? "Create" : "Save changes");
      expect(html).toContain("Cancel");
      expect(html).toContain("View network");
      expect(html).toContain("Before fields");
      expect(html).toContain("After fields");
      expect(html).toContain("Sidebar slot");
      expect(html).toContain("Form footer");
    }
  });

  it("exposes validation and saving state", () => {
    const html = renderToStaticMarkup(
      <CrudEdit
        mode="edit"
        title="Edit user"
        backHref="/operator/users"
        saving
        error="Could not save"
        onSubmit={onSubmit}
      >
        <input name="name" />
      </CrudEdit>,
    );
    expect(html).toContain("Could not save");
    expect(html).toContain("Saving…");
    expect(html).toContain('disabled=""');
  });
});
