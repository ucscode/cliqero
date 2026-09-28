import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

const schema = z
  .object({
    tables: z
      .object({
        default_page_size: z.number().int().positive(),
        max_page_size: z.number().int().positive(),
        page_size_options: z.array(z.number().int().positive()).min(1),
        max_bulk_selection: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ tables }, context) => {
    const options = tables.page_size_options;
    if (
      new Set(options).size !== options.length ||
      options.some((value, index) => index > 0 && value <= options[index - 1])
    ) {
      context.addIssue({
        code: "custom",
        path: ["tables", "page_size_options"],
        message: "must be unique and strictly increasing",
      });
    }
    if (tables.default_page_size > tables.max_page_size) {
      context.addIssue({
        code: "custom",
        path: ["tables", "default_page_size"],
        message: "must not exceed max_page_size",
      });
    }
    if (options.some((value) => value > tables.max_page_size)) {
      context.addIssue({
        code: "custom",
        path: ["tables", "page_size_options"],
        message: "must not exceed max_page_size",
      });
    }
    if (!options.includes(tables.default_page_size)) {
      context.addIssue({
        code: "custom",
        path: ["tables", "default_page_size"],
        message: "must be included in page_size_options",
      });
    }
  });

export type OperatorTableConfiguration = z.infer<typeof schema>;

export function parseOperatorTableConfiguration(value: unknown): OperatorTableConfiguration {
  return schema.parse(value);
}

export function loadOperatorTableConfiguration(path = "config/operator.yaml") {
  return parseOperatorTableConfiguration(
    loadYamlConfiguration(path, process.env, { required: true }),
  );
}
