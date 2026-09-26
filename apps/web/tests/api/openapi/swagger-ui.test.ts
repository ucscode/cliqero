import { describe, expect, it, vi } from "vitest";
import { swaggerUiCredential, swaggerUiHtml, swaggerUiResponse } from "@/api/openapi/swagger-ui";

describe("Swagger UI documentation", () => {
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
