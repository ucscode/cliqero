import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EmailVerifiedPage from "@/app/email-verified/page";

describe("email verification continuation", () => {
  it("continues successful verification to the account", async () => {
    const page = await EmailVerifiedPage({ searchParams: Promise.resolve({ status: "success" }) });
    const html = renderToStaticMarkup(createElement(() => page));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Continue to your account");
    expect(html).not.toContain("Return to sign in");
  });

  it("returns from a verification-link error to the account", async () => {
    const page = await EmailVerifiedPage({ searchParams: Promise.resolve({ status: "error" }) });
    const html = renderToStaticMarkup(createElement(() => page));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Return to your account");
  });
});
