import { describe, expect, it } from "vitest";
import { createApiApp, generateOpenApiDocument } from "@/api/hono";
import type { ApplicationContainer } from "@/infrastructure/container";

const document = generateOpenApiDocument(
  createApiApp({} as ApplicationContainer, { environment: "development", key: null }),
);

const bodylessOperations = new Set([
  "POST /api/withdrawals/{withdrawalId}/cancel",
  "POST /api/payments/{paymentId}/reconcile",
  "POST /api/checkouts/{checkoutId}/pay",
  "POST /api/listings/{listingId}/integrations/{integrationId}/rotate",
  "POST /api/funding-transactions/{fundingId}/cancel",
  "POST /api/funding-transactions/{fundingId}/initialize",
  "POST /api/funding-transactions/{fundingId}/verify",
]);

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function isFreeFormTopLevel(schema: unknown) {
  if (!isObject(schema)) return true;
  if ("$ref" in schema || "oneOf" in schema || "anyOf" in schema || "allOf" in schema) return false;
  return (
    schema.type === "object" &&
    (!isObject(schema.properties) ||
      Object.keys(schema.properties).length === 0 ||
      schema.additionalProperties === true)
  );
}

describe("public OpenAPI contract quality", () => {
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
        if (!successes.length) issues.push(`${label}: missing success response`);
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
});
