import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEmailConfiguration } from "./email";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

it("keeps email transport settings authoritative in YAML", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-email-")), "email.yaml");
  fs.writeFileSync(file, "provider: smtp\nsmtp:\n  host: mailpit\n  port: 1025\n  secure: false\n");
  files.push(file);
  expect(loadEmailConfiguration(file).smtp).toMatchObject({
    host: "mailpit",
    port: 1025,
    secure: false,
  });
});
