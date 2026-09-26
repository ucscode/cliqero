import { describe, expect, it } from "vitest";
import { z } from "zod";
import { usernameSchema } from "@/modules/identity/username";
import { validationErrorPayload } from "@/api/error";
import { apiError } from "@/api/http";
import { PublicApplicationError } from "@/kernel/errors";
import { Hono } from "hono";
import { domainError } from "@/api/shared/error";

describe("validation error payload", () => {
  it("returns a stable human-readable field error rather than Zod issue JSON", async () => {
    const result = z.object({ username: usernameSchema }).safeParse({
      username: "uchenna emmanuel ajah",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(validationErrorPayload(result.error)).toEqual({
      error: "Username must use 3–32 lowercase letters, numbers, _ or -",
      code: "validation_error",
      fields: { username: "Username must use 3–32 lowercase letters, numbers, _ or -" },
    });

    const response = apiError(result.error);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Username must use 3–32 lowercase letters, numbers, _ or -",
      code: "validation_error",
      fields: { username: "Username must use 3–32 lowercase letters, numbers, _ or -" },
    });
  });
});

describe("public application errors", () => {
  it("retains a deliberate conflict and field error without database details", async () => {
    const response = apiError(
      new PublicApplicationError("That username is already taken.", "username_taken", 409, {
        username: "That username is already taken.",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "That username is already taken.",
      code: "username_taken",
      fields: { username: "That username is already taken." },
    });
  });

  it("sanitizes unexpected compatibility API errors to a generic 500", async () => {
    const message = "connection to postgres host db.internal failed: password leaked";
    const response = apiError(new Error(message));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
    expect(JSON.stringify(body)).not.toContain(message);
  });

  it("uses the same sanitized boundary for Hono API errors", async () => {
    const app = new Hono();
    app.onError((error, context) => domainError(context as never, error));
    app.get("/failure", () => {
      throw new Error("internal provider endpoint token=do-not-disclose");
    });

    const response = await app.request("/failure");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
  });
});
