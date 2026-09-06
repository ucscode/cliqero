import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SiteName, SupportEmail } from "../../mdx-components";
import { siteConfig } from "@/config/site";

it("exposes only configured public identity components to MDX", () => {
  const output = renderToStaticMarkup(
    <p>
      <SiteName /> <SupportEmail />
    </p>,
  );

  expect(output).toContain(siteConfig.name);
  expect(output).toContain(siteConfig.supportEmail);
  expect(output).toContain(`mailto:${siteConfig.supportEmail}`);
});
