import { defineCompatibilityContracts } from "@/api/openapi/compatibility";
import { scalar, text, list, object } from "@/api/openapi/schema";

const withdrawalMethodField = {
  oneOf: [
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["text"] }),
        regex: text,
        enum: list(text),
      },
      ["name", "label", "required", "type"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["textarea"] }),
        regex: text,
        enum: list(text),
      },
      ["name", "label", "required", "type"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["select"] }),
        options: list(object({ key: text, label: text })),
      },
      ["name", "label", "required", "type", "options"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        type: scalar("string", { enum: ["fixed"] }),
        value: text,
        copyable: scalar("boolean"),
      },
      ["name", "label", "type", "value"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        type: scalar("string", { enum: ["hidden"] }),
        value: text,
        copyable: scalar("boolean"),
      },
      ["name", "label", "type", "value"],
    ),
  ],
};

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/withdrawal-methods": {
    responseSchema: object({
      methods: list(
        object({
          id: text,
          display_name: text,
          description: text,
          fields: list(withdrawalMethodField),
        }),
      ),
    }),
  },
});
