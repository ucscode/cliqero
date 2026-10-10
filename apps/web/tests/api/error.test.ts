import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { usernameSchema } from "@/modules/identity/username";
import { apiErrorResult, requestCorrelationId, validationErrorPayload } from "@/api/error";
import { apiError } from "@/api/http";
import {
  DomainInvariantError,
  PUBLIC_APPLICATION_ERROR,
  PublicApplicationError,
} from "@/kernel/errors";
import { Hono } from "hono";
import { domainError } from "@/api/shared/error";
import { errorSchema } from "@/api/shared/schemas";

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
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({
      error: "Username must use 3–32 lowercase letters, numbers, _ or -",
      code: "validation_error",
      fields: { username: "Username must use 3–32 lowercase letters, numbers, _ or -" },
      request_id: requestId,
    });
  });
});

describe("public application errors", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("retains a deliberate conflict and field error without database details", async () => {
    const response = apiError(
      new PublicApplicationError("That username is already taken.", "username_taken", 409, {
        username: "That username is already taken.",
      }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "That username is already taken.",
      code: "username_taken",
      fields: { username: "That username is already taken." },
    });
    expect(body.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("preserves a public error reconstructed across a duplicated runtime module boundary", async () => {
    const error = Object.assign(new Error("A catalogue category with this name already exists."), {
      [PUBLIC_APPLICATION_ERROR]: true,
      code: "category_name_conflict",
      status: 409,
      fields: {},
    });
    const response = apiError(error);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "A catalogue category with this name already exists.",
      code: "category_name_conflict",
    });
    expect(body.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("does not expose an unbranded error-shaped object", async () => {
    const error = Object.assign(new Error("private implementation detail"), {
      code: "internal_detail",
      status: 409,
      fields: { secret: "not for clients" },
    });
    const response = apiError(error);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "Internal server error",
      code: "internal_error",
    });
    expect(body.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("does not expose a normal Error with public-looking properties", async () => {
    const error = Object.assign(new Error("do not expose"), {
      name: "SomeDomainError",
      code: "safe_looking",
      status: 422,
    });
    const response = apiError(error);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "Internal server error",
      code: "internal_error",
    });
    expect(body.request_id).toBe(response.headers.get("x-request-id"));
  });

  it("centrally translates known domain invariants to safe 400 validation errors", async () => {
    const result = apiErrorResult(
      new DomainInvariantError("Compare-at price must be greater than the listing price", {
        compare_at_price_minor: "Compare-at price must be greater than the listing price",
      }),
      "trace-123",
    );
    expect(result).toEqual({
      status: 400,
      payload: {
        error: "Compare-at price must be greater than the listing price",
        code: "validation_error",
        fields: {
          compare_at_price_minor: "Compare-at price must be greater than the listing price",
        },
        request_id: "trace-123",
      },
    });
  });

  it("sanitizes unexpected compatibility API errors to a generic 500", async () => {
    const message = "connection to postgres host db.internal failed: password leaked";
    const request = new Request("http://localhost/api/private", {
      headers: { "x-request-id": "safe-trace-1" },
    });
    const response = apiError(new Error(message), request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: "Internal server error",
      code: "internal_error",
      request_id: "safe-trace-1",
    });
    expect(JSON.stringify(body)).not.toContain(message);
  });

  it("uses the same sanitized boundary for Hono API errors", async () => {
    const app = new Hono();
    app.onError((error, context) => domainError(context as never, error));
    app.get("/failure", () => {
      throw new Error("internal provider endpoint token=do-not-disclose");
    });

    const response = await app.request("/failure", {
      headers: { "x-request-id": "hono-trace-1" },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error",
      code: "internal_error",
      request_id: "hono-trace-1",
    });
    expect(response.headers.get("x-request-id")).toBe("hono-trace-1");
  });

  it("translates known Hono domain validation errors without route-specific catches", async () => {
    const app = new Hono();
    app.onError((error, context) => domainError(context as never, error));
    app.get("/invalid", () => {
      throw new DomainInvariantError("Wallet amount must be positive", {
        amount_minor: "Wallet amount must be positive",
      });
    });
    const response = await app.request("/invalid");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Wallet amount must be positive",
      code: "validation_error",
      fields: { amount_minor: "Wallet amount must be positive" },
    });
  });

  it("logs unexpected production failures with a safe correlation reference", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiError(
      new Error("database connection failed password=never-log-this"),
      new Request("http://localhost/api/private", { headers: { "x-request-id": "prod-trace" } }),
    );
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledOnce();
    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toContain("prod-trace");
    expect(message).not.toContain("never-log-this");
    expect(JSON.stringify(await response.json())).not.toContain("database connection");
  });

  it("rejects unsafe caller trace IDs and does not expose them in responses", async () => {
    const request = {
      headers: { get: () => "bad\nheader" },
    } as unknown as Request;
    expect(requestCorrelationId(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("documents structured fields and request IDs in the shared OpenAPI error schema", () => {
    expect(
      errorSchema.safeParse({
        error: "Invalid value",
        code: "validation_error",
        fields: { price: "Must be positive" },
        request_id: "trace-1",
      }).success,
    ).toBe(true);
  });
});
