import { describe, expect, it } from "vitest";
import { captchaTokenPayload } from "./captcha";

describe("CAPTCHA request payload", () => {
  it("omits an absent token when optional protection is disabled", () => {
    expect(captchaTokenPayload(null)).toEqual({});
  });

  it("includes a completed challenge token", () => {
    expect(captchaTokenPayload("provider-token")).toEqual({ captchaToken: "provider-token" });
  });
});
