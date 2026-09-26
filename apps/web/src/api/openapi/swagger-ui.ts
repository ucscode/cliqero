import { canReadOpenApiSchema, type OpenApiSchemaAccess } from "@/security/openapi";

export function swaggerUiCredential(
  access: OpenApiSchemaAccess,
  authorization: string | null,
): string | null {
  if (access.environment === "development") return "";
  if (!access.key || !authorization?.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    const password = decoded.slice(separator + 1);
    return canReadOpenApiSchema(access, password) ? (access.key ?? "") : null;
  } catch {
    return null;
  }
}

export function swaggerUiHtml(spec: unknown): string {
  const serializedSpec = JSON.stringify(spec)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cliqero API documentation</title>
    <link rel="stylesheet" href="/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script id="openapi-spec" type="application/json">${serializedSpec}</script>
    <script src="/docs/assets/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        spec: JSON.parse(document.getElementById("openapi-spec").textContent),
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;
}

export async function swaggerUiResponse(
  request: Request,
  access: OpenApiSchemaAccess,
  loadSchema: (schemaKey?: string) => Response | Promise<Response>,
): Promise<Response> {
  if (swaggerUiCredential(access, request.headers.get("authorization")) === null)
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Cliqero API documentation", charset="UTF-8"' },
    });

  try {
    const schemaResponse = await loadSchema(access.key ?? undefined);
    if (!schemaResponse.ok)
      return new Response("API documentation is unavailable", { status: 502 });

    return new Response(swaggerUiHtml(await schemaResponse.json()), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("API documentation is unavailable", { status: 502 });
  }
}
