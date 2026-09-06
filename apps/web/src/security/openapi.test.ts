import { afterEach, describe, expect, it, vi } from "vitest";
import { canReadOpenApiSchema, loadOpenApiSchemaAccess } from "./openapi";

describe("OpenAPI schema access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads the non-development schema key from OPENAPI_KEY", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAPI_KEY", "schema-secret");
    expect(loadOpenApiSchemaAccess()).toEqual({
      environment: "production",
      key: "schema-secret",
    });
  });

  it("does not require or use a key in development", () => {
    expect(loadOpenApiSchemaAccess("development")).toEqual({
      environment: "development",
      key: null,
    });
    const access = loadOpenApiSchemaAccess("development", "anything");
    expect(access.key).toBeNull();
    expect(canReadOpenApiSchema(access, undefined)).toBe(true);
    expect(canReadOpenApiSchema(access, "anything")).toBe(true);
  });

  it("fails closed when the non-development environment key is missing or empty", () => {
    for (const environment of ["production", "test"] as const) {
      for (const configuredKey of [undefined, "", "   "]) {
        const access = loadOpenApiSchemaAccess(environment, configuredKey);
        expect(access.key).toBeNull();
        expect(canReadOpenApiSchema(access, "anything")).toBe(false);
      }
    }
  });
});
