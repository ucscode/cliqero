import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD_NAME } from "@/lib/honeypot";
import {
  honeypotRejectionResponse,
  isHoneypotValueFilled,
  requestHasHoneypot,
  requestHoneypotSource,
} from "./honeypot";

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
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [HONEYPOT_FIELD_NAME]: "" }),
        }),
      ),
    ).toBe(false);
    expect(
      await requestHasHoneypot(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [HONEYPOT_FIELD_NAME]: "autofilled" }),
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
    const form = new FormData();
    form.set(HONEYPOT_FIELD_NAME, "autofilled");
    expect(
      await requestHasHoneypot(
        new Request("http://localhost", {
          method: "POST",
          body: form,
        }),
      ),
    ).toBe(true);
  });

  it("identifies only the transport source, never the submitted value", async () => {
    expect(
      await requestHoneypotSource(
        new Request("http://localhost/api/test", {
          method: "POST",
          headers: { "x-cliqero-honeypot": "private-value" },
        }),
      ),
    ).toBe("header");
    expect(
      await requestHoneypotSource(
        new Request("http://localhost/api/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [HONEYPOT_FIELD_NAME]: "private-value" }),
        }),
      ),
    ).toBe("json");
  });
});
