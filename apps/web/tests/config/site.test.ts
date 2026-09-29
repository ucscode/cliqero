import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSiteConfiguration } from "@/config/site";
import { toPublicSiteConfiguration, siteConfigurationSchema } from "@/config/site-loader";
import { configurationEnvelope } from "./yaml-fixture";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

it("loads grouped site identity and CRUD limits from YAML and reuses APP_URL", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-site-")), "site.yaml");
  fs.writeFileSync(
    file,
    configurationEnvelope(
      'site:\n  name: Example\n  url: "%env(APP_URL)%"\n  support_email: help@example.test\n  description: "A site"\ncrud:\n  table:\n    max_rows: 45\n',
    ),
  );
  files.push(file);
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://example.test";
  try {
    expect(loadSiteConfiguration(file)).toEqual({
      site: {
        name: "Example",
        url: "https://example.test",
        support_email: "help@example.test",
        description: "A site",
      },
      crud: { table: { max_rows: 45 } },
    });
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});

it.each([0, -1, 201, 1.5])("rejects invalid CRUD max_rows %s", (maxRows) => {
  expect(() =>
    siteConfigurationSchema.parse({
      site: {
        name: "Example",
        url: "https://example.test",
        support_email: "help@example.test",
        description: "A site",
      },
      crud: { table: { max_rows: maxRows } },
    }),
  ).toThrow();
});

it("keeps public site identity independent from internal CRUD configuration", () => {
  const config = loadSiteConfiguration();
  const publicConfig = toPublicSiteConfiguration(config);
  expect(publicConfig).toEqual({
    name: config.site.name,
    url: config.site.url,
    support_email: config.site.support_email,
    description: config.site.description,
  });
  expect(publicConfig).not.toHaveProperty("crud");
});
