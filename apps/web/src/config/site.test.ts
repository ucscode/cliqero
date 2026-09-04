import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSiteConfiguration } from "./site";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

it("loads site identity from YAML and reuses APP_URL", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-site-")), "site.yaml");
  fs.writeFileSync(
    file,
    'name: Example\nurl: "%env(APP_URL)%"\nsupport_email: help@example.test\ndescription: "A site"\n',
  );
  files.push(file);
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://example.test";
  try {
    expect(loadSiteConfiguration(file)).toEqual({
      name: "Example",
      url: "https://example.test",
      support_email: "help@example.test",
      description: "A site",
    });
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
