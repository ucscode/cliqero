import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyCaptchaToken } from "./captcha";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
  vi.restoreAllMocks();
});
function configuration(contents: string) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-captcha-")),
    "captcha.yaml",
  );
  fs.writeFileSync(file, contents);
  files.push(file);
  return file;
}

describe("optional CAPTCHA", () => {
  it("allows public forms when disabled", async () => {
    await expect(
      verifyCaptchaToken(undefined, null, false, configuration("enabled: false")),
    ).resolves.toBe(true);
  });
  it("requires a provider token when enabled", async () => {
    const file = configuration("enabled: true\nprovider: turnstile\nsecret_key: test");
    await expect(verifyCaptchaToken(undefined, null, true, file)).resolves.toBe(false);
  });
  it("does not enforce an action that has not opted in", async () => {
    const file = configuration("enabled: true\nprovider: turnstile\nsecret_key: test");
    await expect(verifyCaptchaToken(undefined, null, false, file)).resolves.toBe(true);
  });

  for (const provider of ["turnstile", "hcaptcha", "recaptcha"] as const) {
    it(`${provider} accepts a successful provider response`, async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
      const file = configuration(`enabled: true\nprovider: ${provider}\nsecret_key: test`);
      await expect(verifyCaptchaToken("token", "127.0.0.1", true, file)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      expect(String(fetch.mock.calls[0]?.[0])).toContain(
        provider === "turnstile"
          ? "challenges.cloudflare.com"
          : provider === "hcaptcha"
            ? "hcaptcha.com"
            : "google.com/recaptcha",
      );
    });

    it(`${provider} rejects an unsuccessful provider response`, async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      );
      const file = configuration(`enabled: true\nprovider: ${provider}\nsecret_key: test`);
      await expect(verifyCaptchaToken("token", null, true, file)).resolves.toBe(false);
    });
  }
});
