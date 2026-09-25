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

  it("creates signup-specific verification content", () => {
    const message = authenticationEmailContent(
      "signup-verification",
      "http://localhost/verify-email?token=x",
    );
    expect(message.subject).toBe("Verify your Cliqero email");
    expect(message.text).toContain("finish setting up");
    expect(message.text).toMatch(/if you did not create this account/i);
    expect(message.html).toContain("Verify email");
  });

  it("creates email-change content without signup wording", () => {
    const message = authenticationEmailContent(
      "email-change",
      "http://localhost/verify-email?token=x",
    );

    expect(message.subject).toBe("Confirm your new Cliqero email");
    expect(message.html).toContain("<h1");
    expect(message.html).toContain("Confirm your new email");
    expect(message.text).toContain("You requested to use this email address");
    expect(message.html).toContain("You requested to use this email address");
    expect(message.text).toContain("Your current email will remain unchanged.");
    expect(message.html).toContain("Your current email will remain unchanged.");
    expect(message.html).toContain(">Confirm email</a>");
    expect(message.text).not.toContain("finish setting up");
    expect(message.html).not.toContain("finish setting up");
    expect(message.text).not.toContain("did not create this account");
    expect(message.html).not.toContain("did not create this account");
  });

  it("keeps ordinary verification content distinct from both signup and email change", () => {
    const message = authenticationEmailContent(
      "verification",
      "http://localhost/verify-email?token=x",
    );

    expect(message.text).toContain("Verify your email address for your Cliqero account.");
    expect(message.text).not.toContain("finish setting up");
    expect(message.text).not.toContain("email change");
  });
});
