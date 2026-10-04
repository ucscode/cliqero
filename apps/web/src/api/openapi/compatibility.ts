import type { JsonSchema } from "@/api/openapi/schema";

export type OpenApiParameterContract = {
  name: string;
  schema: JsonSchema;
  required?: boolean;
};

export type CompatibilityOperationContract = {
  responseSchema?: JsonSchema;
  successStatus?: string;
  responseDescription?: string;
  /** Complete response override for operations with multiple content types or no-content results. */
  response?: Record<string, unknown>;
  responseContent?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  parameters?: readonly OpenApiParameterContract[];
};

export type CompatibilityContractMap = Record<string, CompatibilityOperationContract>;

export function defineCompatibilityContracts<T extends CompatibilityContractMap>(contracts: T): T {
  return contracts;
}

export const jsonBody = (schema: JsonSchema, required = true) => ({
  required,
  content: { "application/json": { schema } },
});

export const multipartBody = (
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  },
});
