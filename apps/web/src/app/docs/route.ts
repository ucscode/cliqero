import { getApiOpenApiDocument } from "@/api/openapi/document";
import { swaggerUiResponse } from "@/api/openapi/swagger-ui";
import { loadOpenApiSchemaAccess } from "@/security/openapi";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return swaggerUiResponse(request, loadOpenApiSchemaAccess(), (schemaKey) =>
    getApiOpenApiDocument(request, schemaKey),
  );
}
