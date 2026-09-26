import { describe, expect, it, vi } from "vitest";
import { applyOpenApiMetadata, type OpenApiDocument } from "@/api/openapi/metadata";
import { swaggerUiCredential, swaggerUiHtml, swaggerUiResponse } from "@/api/openapi/swagger-ui";

describe("Swagger UI documentation", () => {
  it("composes access metadata once when legacy and route metadata both classify an operation", () => {
    const document: OpenApiDocument = {
      paths: {
        "/business": { get: { description: "Business description." } },
        "/unclassified-description": { get: {} },
        "/anonymous": { get: {} },
        "/session": { get: {} },
      },
    };

    applyOpenApiMetadata(
      document,
      [
        {
          path: "/business",
          methods: [{ method: "GET", access: { mode: "account", scope: "treasury:read" } }],
        },
      ],
      [
        [
          { path: "/business", method: "GET", mode: "account", scope: "treasury:read" },
          { path: "/unclassified-description", method: "GET", mode: "account" },
          { path: "/anonymous", method: "GET", mode: "anonymous" },
          { path: "/session", method: "GET", mode: "session_only" },
        ],
        [{ path: "/business", method: "GET", mode: "account", scope: "treasury:read" }],
      ],
    );

    expect(document.paths["/business"].get.description).toBe("Business description.");
    expect(document.paths["/business"].get.description).not.toContain("Authentication:");
    expect(document.paths["/business"].get.security).toEqual([{ CliqeroApiKey: [] }]);
    expect(document.paths["/business"].get["x-required-api-scope"]).toBe("treasury:read");
    expect(document.paths["/unclassified-description"].get.description).toBeUndefined();
    expect(document.paths["/anonymous"].get.description).toBeUndefined();
    expect(document.paths["/anonymous"].get.security).toBeUndefined();
    expect(document.paths["/session"].get.description).toBeUndefined();
    expect(document.paths["/session"].get.security).toBeUndefined();
  });

  it("replaces stale generated scope notes instead of accumulating them", () => {
    const document: OpenApiDocument = {
      paths: { "/scoped": { get: { description: "Business description." } } },
    };
    applyOpenApiMetadata(
      document,
      [],
      [
        [{ path: "/scoped", method: "GET", mode: "account", scope: "treasury:read" }],
        [{ path: "/scoped", method: "GET", mode: "account", scope: "treasury:manage" }],
        [{ path: "/scoped", method: "GET", mode: "account", scope: "treasury:manage" }],
      ],
    );

    expect(document.paths["/scoped"].get.description).toBe("Business description.");
    expect(document.paths["/scoped"].get.description).not.toContain("Authentication:");
    expect(document.paths["/scoped"].get["x-required-api-scope"]).toBe("treasury:manage");
  });

  it("documents generated authentication errors distinctly and preserves the public error schema", () => {
    const document: OpenApiDocument = { paths: {} };
    applyOpenApiMetadata(
      document,
      [
        {
          path: "/compat",
          methods: [{ method: "GET", access: { mode: "account", scope: "wallet:read" } }],
        },
      ],
      [],
    );

    const responses = document.paths["/compat"].get.responses as Record<
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
