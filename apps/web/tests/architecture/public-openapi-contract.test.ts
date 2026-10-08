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
import { API_SCOPES } from "@/modules/identity/api/scopes";

const document = generateOpenApiDocument(
  createApiApp({} as ApplicationContainer, { environment: "development", key: null }),
);

const bodylessOperations = new Set([
  "POST /api/funding-transactions/{fundingId}/reconcile-credit",
  "POST /api/payment-events/{eventId}/reprocess",
  "POST /api/purchases/{purchaseId}/reconcile-entitlement",
  "POST /api/withdrawals/{withdrawalId}/cancel",
  "POST /api/checkouts/{checkoutId}/pay",
  "POST /api/checkout/{checkoutId}/pay",
  "POST /api/listings/{listingId}/integrations/{integrationId}/rotate",
  "POST /api/funding-transactions/{fundingId}/cancel",
  "POST /api/funding-transactions/{fundingId}/initialize",
  "POST /api/funding-transactions/{fundingId}/verify",
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

const noSuccessByDesign = new Set(["POST /api/treasury/expenses"]);

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
  it("documents immutable wallet-transfer compensation as one full-only resource", () => {
    const collection = document.paths["/api/wallet-transfer-compensations"] as any;
    const item = document.paths["/api/wallet-transfer-compensations/{compensationId}"] as any;
    expect(Object.keys(collection).sort()).toEqual(["get", "post"]);
    expect(Object.keys(item)).toEqual(["get"]);
    expect(collection.get.tags).toEqual(["Wallet Transfer Compensations"]);
    expect(collection.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "limit", in: "query" }),
        expect.objectContaining({ name: "cursor", in: "query" }),
      ]),
    );
    expect(collection.get["x-authorization-variants"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "owner", scope: "wallet:read" }),
        expect.objectContaining({ value: "finance_operator", capability: "finance.read" }),
      ]),
    );
    expect(collection.post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "idempotency-key", in: "header", required: true }),
      ]),
    );
    expect(collection.post.requestBody.content["application/json"].schema.properties).toMatchObject(
      {
        transfer_id: { type: "string", format: "uuid" },
        reason: { type: "string", minLength: 1 },
      },
    );
    expect(collection.post["x-required-api-scope"]).toBe("payments:manage");
    expect(collection.post.responses["409"]).toBeDefined();
    expect(
      Object.values(collection.post.responses["409"].content["application/json"].examples).map(
        (example: any) => example.value.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "idempotency_conflict",
        "transfer_already_compensated",
        "account_debt_blocks_operation",
        "transfer_compensation_insufficient_destination",
        "transfer_compensation_treasury_shortfall",
      ]),
    );
    expect(collection.post.responses["201"].content["application/json"].examples).toBeDefined();
    expect(collection.get.responses["200"].content["application/json"].examples).toBeDefined();
    expect(
      item.get.responses["200"].content["application/json"].schema.properties.recovery,
    ).toMatchObject({ type: "object" });
    expect(
      item.get.responses["200"].content["application/json"].examples ??
        item.get.responses["200"].content["application/json"].example,
    ).toBeDefined();
    expect(document.tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Wallet Transfer Compensations" })]),
    );
  });

  it("includes compensation in the canonical wallet activity type contract", () => {
    const typeSchema = (document.paths["/api/wallet/transactions"]?.get as any).responses["200"]
      .content["application/json"].schema.properties.transactions.items.properties.type;
    expect(typeSchema.enum).toContain("wallet_transfer_compensation");
  });

  it("documents immutable Funding Reversals as a scoped resource with idempotency", () => {
    const operations = document.paths["/api/funding-reversals"] as any;
    expect(operations.get.tags).toEqual(["Funding Reversals"]);
    expect(operations.get.summary).toBeTruthy();
    expect(operations.get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "limit", in: "query" })]),
    );
    expect(
      operations.get.responses["200"].content["application/json"].schema.properties.items.items
        .properties,
    ).toMatchObject({
      funding_id: { type: "string", format: "uuid" },
      recovery: { type: "object" },
    });
    expect(operations.post.tags).toEqual(["Funding Reversals"]);
    expect(operations.post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "idempotency-key", in: "header", required: true }),
      ]),
    );
    expect(operations.post.requestBody.content["application/json"].schema.properties).toMatchObject(
      {
        funding_id: { type: "string", format: "uuid" },
        amount_minor: { type: "string" },
        reason: { type: "string" },
      },
    );
    expect(operations.post.responses["409"]).toBeDefined();
    expect(document.paths["/api/funding-reversals/{reversalId}"]?.get).toBeDefined();
    expect(document.paths["/api/funding-reversals/{reversalId}"]).not.toHaveProperty("patch");
    expect(document.paths["/api/funding-reversals/{reversalId}"]).not.toHaveProperty("delete");
  });

  it("documents normalized funding scopes, methods, and adjustment idempotency", () => {
    const fundingList = document.paths["/api/funding-transactions"]?.get as any;
    expect(fundingList["x-required-api-scopes-any-of"]).toEqual(["wallet:read", "payments:read"]);
    expect(fundingList).not.toHaveProperty("x-required-api-scope");
    const fundingCreate = document.paths["/api/funding-transactions"]?.post as any;
    expect(fundingCreate["x-required-api-scopes-any-of"]).toEqual([
      "wallet:fund",
      "payments:manage",
    ]);
    expect(fundingCreate["x-authorization-variants"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          discriminator: "origin",
          value: "provider",
          scope: "wallet:fund",
        }),
        expect.objectContaining({
          discriminator: "origin",
          value: "administrative",
          scope: "payments:manage",
          capability: "finance.manage",
        }),
      ]),
    );
    const fundingDelete = document.paths["/api/funding-transactions"]?.delete as any;
    const deleteRequestSchema = fundingDelete.requestBody.content["application/json"].schema;
    expect(deleteRequestSchema.properties.ids.minItems).toBe(1);
    expect(deleteRequestSchema.properties.ids.maxItems).toBeGreaterThan(0);
    expect(deleteRequestSchema.properties.ids.maxItems).toBeLessThanOrEqual(200);
    const deleteResultSchema = fundingDelete.responses["200"].content["application/json"].schema;
    expect(deleteResultSchema.properties.results.items.properties).toMatchObject({
      id: { type: "string", format: "uuid" },
      deleted: { type: "boolean" },
      error: { type: "string", nullable: true },
    });
    expect(fundingDelete["x-authorization-variants"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          discriminator: "stored_origin",
          value: "provider",
          capability: "system.root",
        }),
        expect.objectContaining({
          discriminator: "stored_origin",
          value: "administrative",
          capability: "finance.manage",
        }),
      ]),
    );

    for (const method of ["get", "patch"]) {
      expect(
        (document.paths["/api/funding-transactions/{fundingId}"]?.[method] as any).responses,
      ).toHaveProperty("404");
    }

    const scopedOperations = Object.values(document.paths).flatMap((path) =>
      Object.values(path).filter((value) => isObject(value)),
    ) as Record<string, any>[];
    for (const operation of scopedOperations) {
      const scopes = [
        operation["x-required-api-scope"],
        ...(operation["x-required-api-scopes-any-of"] ?? []),
        ...(operation["x-authorization-variants"] ?? []).map((variant: any) => variant.scope),
      ].filter(Boolean);
      for (const scope of scopes) expect(API_SCOPES).toContain(scope);
      expect(operation["x-required-api-scope"] ?? "").not.toMatch(/\s|\(|\)|\bor\b/);
    }

    expect(document.paths["/api/funding-methods"]?.get?.tags).toEqual(["Funding Methods"]);
    expect(document.paths["/api/wallet/funding-methods"]).toBeUndefined();
    const createAdjustment = document.paths["/api/earnings/adjustments"]?.post as any;
    expect(createAdjustment.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "idempotency-key", in: "header", required: true }),
      ]),
    );
    expect(createAdjustment.responses["409"]).toBeDefined();
  });

  it("documents withdrawal GETs as authenticated with the baseline read scope", () => {
    for (const operation of [
      document.paths["/api/withdrawals"]?.get,
      document.paths["/api/withdrawals/{withdrawalId}"]?.get,
    ]) {
      expect(operation?.["x-authentication-mode"]).toBe("account");
      expect(operation?.["x-required-api-scope"]).toBe("withdrawals:read");
      expect(operation).not.toHaveProperty("x-public-access");
      expect(operation?.security).toEqual([{ CliqeroApiKey: [] }]);
      expect(operation?.security).not.toContainEqual({});
    }
  });

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
      (document.paths["/api/payment-reconciliations/{reconciliationId}"]?.get?.responses as any)?.[
        "200"
      ]?.content?.["application/json"]?.schema?.properties?.result,
      (document.paths["/api/distributions/{distributionId}"]?.get?.responses as any)?.["200"]
        ?.content?.["application/json"]?.schema?.properties?.policySnapshot,
      (document.paths["/api/funding-transactions/{fundingId}"]?.get?.responses as any)?.["200"]
        ?.content?.["application/json"]?.schema?.properties?.operator_details?.properties
        ?.providerInitialization?.properties?.providerAccountSnapshot,
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
      checkoutCreateRequestSchema.safeParse(example("/api/checkouts", "post", "request")).success,
    ).toBe(true);
    expect(
      checkoutCreateSchema.safeParse(example("/api/checkouts", "post", "response", "201")).success,
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
      fundingDetailSchema.safeParse(
        example("/api/funding-transactions/{fundingId}", "get", "response"),
      ).success,
    ).toBe(true);
  });
});
