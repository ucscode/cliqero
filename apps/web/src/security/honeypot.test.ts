import { describe, expect, it } from "vitest";
import { honeypotRejectionResponse, isHoneypotValueFilled, requestHasHoneypot } from "./honeypot";

describe("form honeypot", () => {
  it("returns a stable public rejection without exposing guard terminology", async () => {
    const response = honeypotRejectionResponse();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Something went wrong. Please try again.",
      code: "request_rejected",
    });
  });

  it("accepts an empty trap and rejects a filled trap server-side", async () => {
    expect(isHoneypotValueFilled("")).toBe(false);
    expect(
      await requestHasHoneypot(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ website: "" }),
        }),
      ),
    ).toBe(false);
    expect(
      await requestHasHoneypot(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ website: "bot" }),
        }),
      ),
    ).toBe(true);
    expect(
      await requestHasHoneypot(
        new Request("http://localhost", {
          method: "POST",
          headers: { "x-cliqero-honeypot": "bot" },
        }),
      ),
    ).toBe(true);
  });
});
