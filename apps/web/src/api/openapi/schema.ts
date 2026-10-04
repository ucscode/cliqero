import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export type JsonSchema = Record<string, unknown>;

export const scalar = (type: string, extra: Record<string, unknown> = {}): JsonSchema => ({
  type,
  ...extra,
});
export const text = scalar("string");
export const uuid = scalar("string", { format: "uuid" });
export const dateTime = scalar("string", { format: "date-time" });
export const nullable = (schema: JsonSchema): JsonSchema => ({ ...schema, nullable: true });
export const list = (items: JsonSchema): JsonSchema => scalar("array", { items });
export const object = (
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
): JsonSchema =>
  scalar("object", {
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  });
export const nullableUnion = (types: readonly string[]): JsonSchema => ({
  anyOf: types.map((type) => scalar(type, { nullable: true })),
});

const registry = new OpenAPIRegistry();
const schemaNames = new WeakMap<object, string>();
const components: Record<string, JsonSchema> = {};
let nextSchemaId = 0;

/** Converts Zod through the same OpenAPI 3.0 generator used by Hono routes. */
export function zodSchema(schema: z.ZodType): JsonSchema {
  let name = schemaNames.get(schema);
  if (!name) {
    name = `CliqeroCompatibilitySchema${++nextSchemaId}`;
    schemaNames.set(schema, name);
    registry.register(name, schema);
  }

  const generated = new OpenApiGeneratorV3(registry.definitions).generateComponents().components
    ?.schemas;
  if (generated) Object.assign(components, generated);
  const result = components[name];
  if (!result) throw new Error(`OpenAPI 3.0 conversion did not produce schema ${name}`);
  return result;
}

/** Schemas generated above are merged into the final document's shared components. */
export function generatedZodComponents(): Record<string, JsonSchema> {
  return { ...components };
}
