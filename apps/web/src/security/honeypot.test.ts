import { describe, expect, it } from "vitest";
import { isHoneypotValueFilled, requestHasHoneypot } from "./honeypot";

describe("form honeypot", () => {
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
