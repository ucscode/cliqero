import { describe, expect, it, vi } from "vitest";
import { applyOpenApiMetadata, type OpenApiDocument } from "@/api/openapi/metadata";
import { swaggerUiCredential, swaggerUiHtml, swaggerUiResponse } from "@/api/openapi/swagger-ui";

describe("Swagger UI documentation", () => {
  it("composes access metadata once when legacy and route metadata both classify an operation", () => {
    const document: OpenApiDocument = {
      paths: {
        "/api/treasury": { get: { description: "Business description." } },
        "/api/me/session": { get: {} },
        "/api/health": { get: {} },
        "/api/me/access": { get: {} },
      },
    };

    applyOpenApiMetadata(
      document,
      [
        {
          path: "/api/treasury",
          methods: [{ method: "GET", access: { mode: "account", scope: "treasury:read" } }],
        },
      ],
      [
        [
          { path: "/api/treasury", method: "GET", mode: "account", scope: "treasury:read" },
          { path: "/api/me/session", method: "GET", mode: "account" },
          { path: "/api/health", method: "GET", mode: "anonymous" },
          { path: "/api/me/access", method: "GET", mode: "session_only" },
        ],
        [{ path: "/api/treasury", method: "GET", mode: "account", scope: "treasury:read" }],
      ],
    );

    expect(document.paths["/api/treasury"].get.description).toBe("Business description.");
    expect(document.paths["/api/treasury"].get.description).not.toContain("Authentication:");
    expect(document.paths["/api/treasury"].get.security).toEqual([{ CliqeroApiKey: [] }]);
    expect(document.paths["/api/treasury"].get["x-required-api-scope"]).toBe("treasury:read");
    expect(document.paths["/api/me/session"].get.description).toContain(
      "current account projection",
    );
    expect(document.paths["/api/health"].get.description).toContain("Health");
    expect(document.paths["/api/health"].get.description).not.toContain("Authentication:");
    expect(document.paths["/api/health"].get.security).toBeUndefined();
    expect(document.paths["/api/me/access"].get.description).toContain("access capabilities");
    expect(document.paths["/api/me/access"].get.description).not.toContain("API-key scope");
    expect(document.paths["/api/me/access"].get.security).toBeUndefined();
  });

  it("replaces stale generated scope notes instead of accumulating them", () => {
    const document: OpenApiDocument = {
      paths: { "/api/treasury": { get: { description: "Business description." } } },
    };
    applyOpenApiMetadata(
      document,
      [],
      [
        [{ path: "/api/treasury", method: "GET", mode: "account", scope: "treasury:read" }],
        [{ path: "/api/treasury", method: "GET", mode: "account", scope: "treasury:manage" }],
        [{ path: "/api/treasury", method: "GET", mode: "account", scope: "treasury:manage" }],
      ],
    );

    expect(document.paths["/api/treasury"].get.description).toBe("Business description.");
    expect(document.paths["/api/treasury"].get.description).not.toContain("Authentication:");
    expect(document.paths["/api/treasury"].get["x-required-api-scope"]).toBe("treasury:manage");
  });

  it("documents generated authentication errors distinctly and preserves the public error schema", () => {
    const document: OpenApiDocument = { paths: { "/api/wallet": { get: {} } } };
    applyOpenApiMetadata(
      document,
      [
        {
          path: "/api/wallet",
          methods: [{ method: "GET", access: { mode: "account", scope: "wallet:read" } }],
        },
      ],
      [],
    );

    const responses = document.paths["/api/wallet"].get.responses as Record<
      string,
      { description: string; content: Record<string, { schema: Record<string, unknown> }> }
    >;
    expect(responses["401"].description).toBe("Authentication required");
    expect(responses["403"].description).toBe("Insufficient permissions");
    expect(responses["401"].content["application/json"].schema).toMatchObject({
      type: "object",
      required: ["error"],
      properties: { error: { type: "string" }, code: { type: "string" } },
    });
    expect(responses["403"].content["application/json"].schema).toEqual(
      responses["401"].content["application/json"].schema,
    );
  });

  it("generates authentication responses according to each legacy access mode", () => {
    const document: OpenApiDocument = {
      paths: {
        "/api/health": { get: {} },
        "/api/listings": { get: {} },
        "/api/accounts": { get: {} },
        "/api/me/session": { get: {} },
        "/api/me/access": { get: {} },
        "/api/wallet": { get: {} },
      },
    };
    applyOpenApiMetadata(
      document,
      [
        { path: "/api/health", methods: [{ method: "GET", access: { mode: "anonymous" } }] },
        {
          path: "/api/listings",
          methods: [{ method: "GET", access: { mode: "anonymous", apiKey: "reject" } }],
        },
        { path: "/api/accounts", methods: [{ method: "GET", access: { mode: "account" } }] },
        {
          path: "/api/me/session",
          methods: [{ method: "GET", access: { mode: "session_only" } }],
        },
        {
          path: "/api/me/access",
          methods: [{ method: "GET", access: { mode: "integration_credential" } }],
        },
        { path: "/api/wallet", methods: [{ method: "GET", access: { mode: "deny" } }] },
      ],
      [],
    );

    const responses = (path: string) =>
      document.paths[path].get.responses as Record<string, { description: string }>;
    expect(responses("/api/health")).not.toHaveProperty("401");
    expect(responses("/api/health")).not.toHaveProperty("403");
    expect(document.paths["/api/health"].get.security).toBeUndefined();
    expect(responses("/api/listings")).not.toHaveProperty("401");
    expect(responses("/api/listings")["403"].description).toBe("Insufficient permissions");

    expect(responses("/api/accounts")["401"].description).toBe("Authentication required");
    expect(responses("/api/accounts")["403"].description).toBe("Insufficient permissions");
    expect(document.paths["/api/accounts"].get.security).toEqual([{ CliqeroApiKey: [] }]);

    expect(responses("/api/me/session")["401"].description).toBe("Authentication required");
    expect(responses("/api/me/session")["403"].description).toBe("Insufficient permissions");
    expect(document.paths["/api/me/session"].get.security).toBeUndefined();

    expect(responses("/api/me/access")["401"].description).toBe("Authentication required");
    expect(responses("/api/me/access")).not.toHaveProperty("403");

    expect(responses("/api/wallet")).not.toHaveProperty("401");
    expect(responses("/api/wallet")["403"].description).toBe("Insufficient permissions");
    expect(document.paths["/api/wallet"].get.security).toBeUndefined();
  });

  it("preserves specific explicit authentication response descriptions", () => {
    const document: OpenApiDocument = {
      paths: {
        "/api/me/access": {
          get: {
            responses: {
              "401": { description: "Integration credential is invalid or expired" },
              "403": { description: "Credential is not permitted for this resource" },
            },
          },
        },
      },
    };
    applyOpenApiMetadata(
      document,
      [],
      [[{ path: "/api/me/access", method: "GET", mode: "integration_credential" }]],
    );

    expect(document.paths["/api/me/access"].get.responses).toMatchObject({
      "401": { description: "Integration credential is invalid or expired" },
      "403": { description: "Credential is not permitted for this resource" },
    });
  });

  it("uses the same protected OpenAPI key without exposing it in the UI document", () => {
    const secret = "openapi-private-test-key";
    const access = { environment: "production", key: secret } as const;
    const authorization = `Basic ${Buffer.from(`operator:${secret}`).toString("base64")}`;
    const credential = swaggerUiCredential(access, authorization);

    expect(credential).toBe(secret);
    expect(swaggerUiCredential(access, null)).toBeNull();
    expect(
      swaggerUiCredential(access, `Basic ${Buffer.from("operator:wrong-key").toString("base64")}`),
    ).toBeNull();

    const html = swaggerUiHtml({ openapi: "3.0.0", info: { title: "Cliqero API" } });
    expect(html).toContain("swagger-ui-bundle.js");
    expect(html).toContain('id="openapi-spec"');
    expect(html).not.toContain(secret);
    expect(html).not.toContain("OPENAPI_KEY");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
  });

  it("keeps development docs open and safely embeds the generated spec", () => {
    expect(swaggerUiCredential({ environment: "development", key: null }, null)).toBe("");
    const html = swaggerUiHtml({
      openapi: "3.0.0",
      components: {
        securitySchemes: {
          CliqeroApiKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Cliqero API Key",
          },
        },
      },
      paths: {
        "/api/wallet": { get: { security: [{ CliqeroApiKey: [] }] } },
      },
      description: "</script><script>alert(1)</script>",
    });
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("swagger-ui-bundle.js");
    expect(html).toContain('"CliqeroApiKey"');
    expect(html).toContain('"security":[{"CliqeroApiKey":[]}]');
    expect(html).toContain("presets: [SwaggerUIBundle.presets.apis]");
  });

  it("authorizes the docs request before loading the canonical schema server-side", async () => {
    const secret = "openapi-private-test-key";
    const access = { environment: "production", key: secret } as const;
    const loadSchema = vi.fn(async (schemaKey?: string) => {
      expect(schemaKey).toBe(secret);
      return Response.json({ openapi: "3.0.0", info: { title: "Cliqero API" } });
    });

    const unauthorized = await swaggerUiResponse(
      new Request("https://cliqero.example/docs"),
      access,
      loadSchema,
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Basic");
    expect(loadSchema).not.toHaveBeenCalled();

    const authorization = `Basic ${Buffer.from(`operator:${secret}`).toString("base64")}`;
    const authorized = await swaggerUiResponse(
      new Request("https://cliqero.example/docs", { headers: { authorization } }),
      access,
      loadSchema,
    );
    const html = await authorized.text();
    expect(authorized.status).toBe(200);
    expect(html).toContain("Cliqero API");
    expect(html).not.toContain(secret);
    expect(html).not.toMatch(/(?:localStorage|sessionStorage|OPENAPI_KEY)/);
    expect(loadSchema).toHaveBeenCalledTimes(1);
  });
});
