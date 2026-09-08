import { describe, expect, it } from "vitest";
import { POST as apiPost } from "./[[...route]]/route";
import { POST as authPost } from "./auth/[...all]/route";

const rejectedBody = {
  error: "Something went wrong. Please try again.",
  code: "request_rejected",
};

describe("API honeypot mutation boundaries", () => {
  it("rejects a populated trap before the main API application runs", async () => {
    const response = await apiPost(
      new Request("http://localhost/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliqeroTrap: "autofilled" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(rejectedBody);
  });

  it("rejects a populated trap before Better Auth handles a mutation", async () => {
    const response = await authPost(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "x-cliqero-honeypot": "autofilled" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(rejectedBody);
  });
});
