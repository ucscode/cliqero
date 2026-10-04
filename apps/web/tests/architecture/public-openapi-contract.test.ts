import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { createApiApp, generateOpenApiDocument } from "@/api/hono";
import type { ApplicationContainer } from "@/infrastructure/container";
import { listingCreateSchema } from "@/api/compat/listings/contracts";
import { withdrawalDestinationPatchSchema } from "@/api/compat/withdrawal-destinations/contracts";
import { walletTransferResultSchema } from "@/api/compat/wallet/transfers/contracts";
import { checkoutCreateRequestSchema, checkoutCreateSchema } from "@/api/compat/checkout/contracts";
import { listingPageSchema, listingWithMediaViewSchema } from "@/api/compat/listings/contracts";
import { withdrawalResponseSchema } from "@/api/compat/withdrawals/contracts";
import { fundingDetailSchema } from "@/api/compat/wallet/fund/contracts";
import { reviewPageSchema } from "@/api/routes/reviews/contracts";
import { withdrawalMutationResponseSchema } from "@/api/routes/withdrawals/contracts";
import { opaqueJsonSchema } from "@/api/shared/schemas";

const document = generateOpenApiDocument(
  createApiApp({} as ApplicationContainer, { environment: "development", key: null }),
);

const bodylessOperations = new Set([
  "POST /api/withdrawals/{withdrawalId}/cancel",
  "POST /api/payments/{paymentId}/reconcile",
  "POST /api/checkouts/{checkoutId}/pay",
  "POST /api/checkout/{checkoutId}/pay",
  "POST /api/listings/{listingId}/integrations/{integrationId}/rotate",
  "POST /api/funding-transactions/{fundingId}/cancel",
  "POST /api/funding-transactions/{fundingId}/initialize",
  "POST /api/funding-transactions/{fundingId}/verify",
  "POST /api/funding/{fundingId}/confirm-bank-transfer",
  "POST /api/treasury/entries",
  "POST /api/treasury/expenses",
  "POST /api/wallet/fund/{fundingId}/cancel",
  "POST /api/wallet/fund/{fundingId}/initialize",
  "POST /api/wallet/fund/{fundingId}/verify",
]);

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function isFreeFormTopLevel(schema: unknown): boolean {
  if (!isObject(schema)) return true;
  if ("$ref" in schema) return false;
  const alternatives = [schema.oneOf, schema.anyOf, schema.allOf].filter(Array.isArray);
  if (alternatives.length)
    return alternatives.every((branches) =>
      (branches as unknown[]).every((branch) => isFreeFormTopLevel(branch)),
    );
  if (["string", "number", "integer", "boolean"].includes(String(schema.type))) return false;
  if (schema.type === "array") return isFreeFormTopLevel(schema.items);
  if (schema.type !== "object") return true;
  const hasProperties = isObject(schema.properties) && Object.keys(schema.properties).length > 0;
  return (
    !hasProperties || schema.additionalProperties === true || isObject(schema.additionalProperties)
  );
}

const noSuccessByDesign = new Set(["POST /api/treasury/entries", "POST /api/treasury/expenses"]);

function schemaObjects(documentValue: unknown): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const visitSchema = (value: unknown, path: string) => {
    if (!isObject(value)) return;
    found.push({ ...value, __testPath: path });
    for (const key of ["properties", "patternProperties"]) {
      if (isObject(value[key]))
        for (const [name, child] of Object.entries(value[key]))
          visitSchema(child, `${path}/${key}/${name}`);
    }
    for (const key of ["items", "additionalProperties", "not"])
      visitSchema(value[key], `${path}/${key}`);
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"])
      if (Array.isArray(value[key]))
        value[key].forEach((child: unknown, index: number) =>
          visitSchema(child, `${path}/${key}/${index}`),
        );
  };
  const visitMedia = (media: unknown, path: string) => {
    if (isObject(media)) visitSchema(media.schema, `${path}/schema`);
  };
  const openApiDocument = documentValue as typeof document;
  for (const [path, pathItem] of Object.entries(openApiDocument.paths))
    if (isObject(pathItem))
      for (const [method, operation] of Object.entries(pathItem))
        if (isObject(operation)) {
          if (isObject(operation.requestBody) && isObject(operation.requestBody.content))
            for (const [mediaType, media] of Object.entries(operation.requestBody.content))
              visitMedia(media, `${method.toUpperCase()} ${path}/requestBody/${mediaType}`);
          if (Array.isArray(operation.parameters))
            for (const [index, parameter] of operation.parameters.entries())
              if (isObject(parameter))
                visitSchema(
                  parameter.schema,
                  `${method.toUpperCase()} ${path}/parameters/${index}`,
                );
          if (isObject(operation.responses))
            for (const [status, response] of Object.entries(operation.responses))
              if (isObject(response) && isObject(response.content))
                for (const [mediaType, media] of Object.entries(response.content))
                  visitMedia(
                    media,
                    `${method.toUpperCase()} ${path}/responses/${status}/${mediaType}`,
                  );
        }
  const schemas = openApiDocument.components?.schemas;
  if (isObject(schemas))
    for (const [name, schema] of Object.entries(schemas))
      visitSchema(schema, `components/schemas/${name}`);
  return found;
}

describe("public OpenAPI contract quality", () => {
  it("is valid OpenAPI 3.0 and uses OpenAPI-compatible nullable schemas", async () => {
    expect(document.openapi).toMatch(/^3\.0\./);
    const schemas = schemaObjects(document);
    expect(schemas.some((schema) => schema.type === "null")).toBe(false);
    expect(schemas.some((schema) => "$schema" in schema)).toBe(false);
    expect(
      schemas.some((schema) =>
        ["$defs", "definitions", "prefixItems", "unevaluatedProperties"].some(
          (key) => key in schema,
        ),
      ),
    ).toBe(false);
    const nullableSchemas = schemas.filter((schema) => schema.nullable === true);
    expect(nullableSchemas.length).toBeGreaterThan(0);
    expect(nullableSchemas.filter((schema) => !schema.type && !schema.$ref)).toEqual([]);

    const metadataValueSchema = (document.paths["/api/listings"]?.post?.requestBody as any)
      ?.content?.["application/json"]?.schema?.properties?.metadata?.additionalProperties;
    expect(metadataValueSchema.anyOf).toEqual([
      { type: "string", nullable: true },
      { type: "number", nullable: true },
      { type: "boolean", nullable: true },
    ]);

    const opaqueFields = [
      (document.paths["/api/payments/{paymentId}"]?.get?.responses as any)?.["200"]?.content?.[
        "application/json"
      ]?.schema?.properties?.conversion_snapshot,
      (document.paths["/api/payments/{paymentId}/reconcile"]?.post?.responses as any)?.["200"]
        ?.content?.["application/json"]?.schema?.properties?.attempt?.properties?.result,
      (document.paths["/api/distributions/{distributionId}"]?.get?.responses as any)?.["200"]
        ?.content?.["application/json"]?.schema?.properties?.policySnapshot,
      (document.paths["/api/funding/{fundingId}"]?.get?.responses as any)?.["200"]?.content?.[
        "application/json"
      ]?.schema?.properties?.providerInitialization?.properties?.providerAccountSnapshot,
    ];
    for (const opaqueField of opaqueFields) {
      expect(opaqueField.anyOf).toEqual([
        { type: "string", nullable: true },
        { type: "number", nullable: true },
        { type: "boolean", nullable: true },
        { type: "object", nullable: true, additionalProperties: true },
        { type: "array", nullable: true, items: {} },
      ]);
    }
    expect(opaqueJsonSchema.safeParse(null).success).toBe(true);
    expect(opaqueJsonSchema.safeParse({ nested: ["opaque", 12, null] }).success).toBe(true);
    expect(JSON.stringify(document)).not.toContain("x-cliqero-opaque-json");
    await expect(SwaggerParser.validate(structuredClone(document) as any)).resolves.toBeDefined();
  });

  it("gives every current operation one appropriate tag and a meaningful summary", () => {
    const tags = document.tags?.map(({ name }) => name) ?? [];
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).not.toContain("Core/System");
    expect(tags).not.toContain("Internal UI");

    for (const [path, pathItem] of Object.entries(document.paths))
      for (const [method, operation] of Object.entries(pathItem)) {
        expect(operation.tags, `${method.toUpperCase()} ${path}`).toHaveLength(1);
        expect(tags).toContain((operation.tags as string[])[0]);
        expect(operation.summary, `${method.toUpperCase()} ${path}`).toEqual(
          expect.stringMatching(/\S/),
        );
        expect(operation.description, `${method.toUpperCase()} ${path}`).toEqual(
          expect.stringMatching(/\S/),
        );
      }
  });

  it("documents explicit bodies and success schemas without top-level free-form contracts", () => {
    const issues: string[] = [];
    for (const [path, pathItem] of Object.entries(document.paths))
      for (const [method, operation] of Object.entries(pathItem)) {
        const label = `${method.toUpperCase()} ${path}`;
        if (["post", "put", "patch"].includes(method) && !bodylessOperations.has(label)) {
          const content = isObject(operation.requestBody) ? operation.requestBody.content : null;
          const media = isObject(content) ? Object.values(content).find(isObject) : undefined;
          if (!media || !isObject(media.schema) || isFreeFormTopLevel(media.schema))
            issues.push(`${label}: missing or free-form request schema`);
        }

        const responses = isObject(operation.responses) ? operation.responses : {};
        const successes = Object.entries(responses).filter(([status]) => /^2/.test(status));
        if (!successes.length && !noSuccessByDesign.has(label))
          issues.push(`${label}: missing success response`);
        if (noSuccessByDesign.has(label))
          expect(responses["410"], `${label} documents its actual gone response`).toBeDefined();
        for (const [status, response] of successes) {
          if (!isObject(response)) {
            issues.push(`${label}: ${status} response is invalid`);
            continue;
          }
          if (status === "204") continue;
          const content = isObject(response.content) ? response.content : null;
          const media = isObject(content) ? Object.values(content).find(isObject) : undefined;
          if (!media || !isObject(media.schema) || isFreeFormTopLevel(media.schema))
            issues.push(`${label}: ${status} missing or free-form response schema`);
          if (typeof response.description !== "string" || !response.description.trim())
            issues.push(`${label}: ${status} missing success description`);
        }
      }

    expect(issues).toEqual([]);
    expect(JSON.stringify(document)).not.toContain("additionalProp1");
  });

  it("includes examples for documented request and success media types and typed API errors", () => {
    for (const [path, pathItem] of Object.entries(document.paths))
      for (const [method, operation] of Object.entries(pathItem)) {
        const label = `${method.toUpperCase()} ${path}`;
        const assertExamples = (kind: string, value: unknown) => {
          if (!isObject(value) || !isObject(value.content)) return;
          for (const [mediaType, media] of Object.entries(value.content))
            if (isObject(media) && media.schema)
              expect(
                media.examples || media.example,
                `${label} ${kind} ${mediaType}`,
              ).toBeDefined();
        };

        assertExamples("request", operation.requestBody);
        if (!isObject(operation.responses)) continue;
        for (const [status, response] of Object.entries(operation.responses)) {
          assertExamples(`response ${status}`, response);
          if (!/^[45]/.test(status) || !isObject(response) || !isObject(response.content)) continue;
          const json = response.content["application/json"];
          if (isObject(json) && isObject(json.schema)) {
            expect(json.schema.properties?.error, `${label} error ${status}`).toBeDefined();
            expect(json.schema.properties?.code, `${label} error ${status}`).toBeDefined();
          }
        }
      }
  });

  it("documents corrected resource projections and listing transfer formats", () => {
    const destinationSchema = (
      document.paths["/api/withdrawal-destinations"]?.get?.responses as any
    )?.["200"]?.content?.["application/json"]?.schema;
    expect(destinationSchema.type).toBe("array");
    expect(destinationSchema.items.properties.method.properties).toHaveProperty("display_name");
    expect(destinationSchema.items.properties.fields.items.properties).toHaveProperty(
      "displayValue",
    );
    expect(destinationSchema.items.properties).not.toHaveProperty("accountId");
    expect(destinationSchema.items.properties).not.toHaveProperty("values");

    const listingSchema = (document.paths["/api/listings/{listingId}"]?.get?.responses as any)?.[
      "200"
    ]?.content?.["application/json"]?.schema;
    expect(listingSchema.properties.price.properties).toHaveProperty("minor_amount");
    expect(listingSchema.properties.price.properties).not.toHaveProperty("amount_minor");

    const exportContent = (document.paths["/api/listings/export"]?.get?.responses as any)?.["200"]
      ?.content;
    expect(Object.keys(exportContent).sort()).toEqual([
      "application/json",
      "application/yaml",
      "text/csv",
    ]);

    const importOperation = document.paths["/api/listings/import"]?.post as any;
    expect(importOperation.responses["207"].description).toMatch(/per-record results/i);
    expect(
      importOperation.responses["207"].content["application/json"].schema.properties,
    ).toHaveProperty("records");

    const reviewCollection = (document.paths["/api/reviews"]?.get?.responses as any)?.["200"]
      ?.content?.["application/json"]?.schema;
    expect(reviewCollection.properties.items.items.properties).toHaveProperty("listing_id");
    expect(reviewCollection.properties.items.items.properties).toHaveProperty("rating");
    expect(reviewCollection.properties.items.items.additionalProperties).toBe(false);

    for (const [path, method] of [
      ["/api/withdrawals/{withdrawalId}", "patch"],
      ["/api/withdrawals/{withdrawalId}/cancel", "post"],
      ["/api/withdrawals/{withdrawalId}/complete", "post"],
    ]) {
      const resultSchema = (document.paths[path]?.[method]?.responses as any)?.["200"]?.content?.[
        "application/json"
      ]?.schema;
      expect(resultSchema.properties.destination.properties).toHaveProperty("savedDestinationId");
      expect(resultSchema.properties).toHaveProperty("idempotencyKey");
    }
  });

  it("keeps compatibility request/response documentation aligned with runtime contracts", () => {
    const contentSchema = (
      path: string,
      method: string,
      status: string,
      media = "application/json",
    ) => (document.paths[path]?.[method]?.responses as any)?.[status]?.content?.[media]?.schema;
    const requestSchema = (path: string, method: string, media = "application/json") =>
      (document.paths[path]?.[method]?.requestBody as any)?.content?.[media]?.schema;
    const example = (
      path: string,
      method: string,
      kind: "request" | "response",
      status?: string,
    ) => {
      const operation = document.paths[path]?.[method] as any;
      const media =
        kind === "request"
          ? operation.requestBody.content["application/json"]
          : operation.responses[status ?? "200"].content["application/json"];
      return media.examples.example.value;
    };

    const listingRequest = requestSchema("/api/listings", "post");
    const listingExample = (document.paths["/api/listings"]?.post?.requestBody as any).content[
      "application/json"
    ].examples.example.value;
    expect(listingCreateSchema.safeParse(listingExample).success).toBe(true);
    const metadataValueSchema = listingRequest.properties.metadata.additionalProperties;
    const metadataTypes = metadataValueSchema.anyOf.map((branch: any) => branch.type);
    expect(metadataTypes).toEqual(["string", "number", "boolean"]);
    expect(metadataValueSchema.anyOf.every((branch: any) => branch.nullable)).toBe(true);

    expect(withdrawalDestinationPatchSchema.safeParse({ name: "Primary bank" }).success).toBe(true);
    expect(withdrawalDestinationPatchSchema.safeParse({ values: { account: "123" } }).success).toBe(
      true,
    );
    const destinationRequest = requestSchema(
      "/api/withdrawal-destinations/{destinationId}",
      "patch",
    );
    const destinationExample = example(
      "/api/withdrawal-destinations/{destinationId}",
      "patch",
      "request",
    );
    expect(withdrawalDestinationPatchSchema.safeParse(destinationExample).success).toBe(true);
    const editableBranch = (destinationRequest.oneOf ?? destinationRequest.anyOf).find(
      (branch: any) => branch.properties?.name,
    );
    const requiredFields = editableBranch.required ?? [];
    expect(requiredFields).not.toContain("name");
    expect(requiredFields).not.toContain("values");

    const mediaRequest = requestSchema(
      "/api/listings/{listingId}/media",
      "post",
      "multipart/form-data",
    );
    expect(mediaRequest.required).toEqual(["file"]);
    expect(mediaRequest.properties).toHaveProperty("position");
    expect(mediaRequest.properties).toHaveProperty("alt_text");

    const parentResponse = document.paths["/api/referrals/parent"]?.post?.responses as any;
    expect(parentResponse["204"]).toBeDefined();
    expect(parentResponse["204"]).not.toHaveProperty("content");
    expect(parentResponse["200"]).toBeUndefined();

    const transferResponse = contentSchema("/api/wallet/transfers", "post", "201");
    const transferExample = (document.paths["/api/wallet/transfers"]?.post?.responses as any)["201"]
      .content["application/json"].examples.example.value;
    expect(walletTransferResultSchema.safeParse(transferExample).success).toBe(true);
    expect(transferResponse.properties).toHaveProperty("grossMinor");
    expect(transferResponse.properties).not.toHaveProperty("gross_amount_minor");

    expect(listingPageSchema.safeParse(example("/api/listings", "get", "response")).success).toBe(
      true,
    );
    expect(
      listingWithMediaViewSchema.safeParse(example("/api/listings/{listingId}", "get", "response"))
        .success,
    ).toBe(true);
    expect(
      checkoutCreateRequestSchema.safeParse(example("/api/checkout", "post", "request")).success,
    ).toBe(true);
    expect(
      checkoutCreateSchema.safeParse(example("/api/checkout", "post", "response", "201")).success,
    ).toBe(true);
    expect(reviewPageSchema.safeParse(example("/api/reviews", "get", "response")).success).toBe(
      true,
    );
    expect(
      withdrawalResponseSchema.safeParse(example("/api/withdrawals", "post", "response", "201"))
        .success,
    ).toBe(true);
    expect(
      withdrawalMutationResponseSchema.safeParse(
        example("/api/withdrawals/{withdrawalId}", "patch", "response"),
      ).success,
    ).toBe(true);
    expect(
      fundingDetailSchema.safeParse(example("/api/wallet/fund/{fundingId}", "get", "response"))
        .success,
    ).toBe(true);
  });
});
