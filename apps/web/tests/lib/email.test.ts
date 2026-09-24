import { describe, expect, it } from "vitest";
import { authenticationEmailContent, loadEmailConfiguration } from "@/lib/email";

describe("authentication email content", () => {
  it("loads SMTP settings from the enveloped example", () => {
    expect(loadEmailConfiguration("config/modules/email.example.yaml")).toMatchObject({
      provider: "smtp",
      smtp: { host: "mailpit", port: 1025, secure: false },
    });
  });

  it("creates a branded password-reset message with safe fallback content", () => {
    const message = authenticationEmailContent("reset", "http://localhost/reset-password/token");
    expect(message.subject).toContain("reset your password");
    expect(message.text).toContain("ignore this email");
    expect(message.html).toContain("Choose a new password");
    expect(message.html).toContain("http://localhost/reset-password/token");
  });

  it("creates a verification message instead of a bare link", () => {
    const message = authenticationEmailContent(
      "verification",
      "http://localhost/verify-email?token=x",
    );
    expect(message.subject).toContain("Verify");
    expect(message.text).toContain("finish setting up");
    expect(message.html).toContain("Verify email");
  });
});
