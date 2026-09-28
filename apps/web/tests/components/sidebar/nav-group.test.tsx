import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarNavGroup } from "@/components/sidebar/nav-group";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("shared sidebar navigation groups", () => {
  it("opens the active child and exposes keyboard-accessible group state", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <SidebarNavGroup
          label="Catalogue"
          activeKey="reviews"
          items={[
            { key: "catalogue", href: "/operator/catalogue", label: "Listings" },
            { key: "reviews", href: "/operator/reviews", label: "Reviews" },
          ]}
        />
      </SidebarProvider>,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Catalogue");
    expect(markup).toContain("Listings");
    expect(markup).toContain("Reviews");
    expect(markup).toContain("border-l");
    expect(markup).toContain("rotate-180");
  });
});
