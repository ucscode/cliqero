import countryList from "country-list";
import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import type { Account } from "@/modules/identity/account";
import type { DestinationField } from "@/modules/withdrawal/withdrawal";

const countryCodes = new Set((countryList as unknown as { getCodes(): string[] }).getCodes());
const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine((value) => countryCodes.has(value));

const fieldName = z.string().regex(/^[a-z][a-z0-9_]*$/);
const regex = z
  .string()
  .max(256)
  .refine((value) => {
    try {
      new RegExp(value);
      return true;
    } catch {
      return false;
    }
  }, "Field regex is not a valid regular expression");

const enumValues = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .superRefine((values, context) => {
    const unique = new Set<string>();
    values.forEach((value, index) => {
      if (unique.has(value))
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Enum values must be unique",
        });
      unique.add(value);
    });
  });

const optionSchema = z
  .object({
    key: z.string().trim().min(1).max(500),
    value: z.string().trim().min(1).max(200),
  })
  .strict();

const optionsSchema = z
  .array(optionSchema)
  .min(1)
  .superRefine((options, context) => {
    const keys = new Set<string>();
    options.forEach((option, index) => {
      if (keys.has(option.key))
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Select option keys must be unique",
        });
      keys.add(option.key);
    });
  });

const ignoredAttributeNames = new Set([
  "name",
  "type",
  "required",
  "value",
  "defaultvalue",
  "checked",
  "defaultchecked",
  "pattern",
  "id",
  "list",
  "multiple",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "children",
  "dangerouslysetinnerhtml",
  "ref",
  "key",
  "class",
  "classname",
  "style",
  "label",
  "copyable",
  "regex",
  "enum",
  "options",
]);

const attributeName = z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
const attributeValue = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
const attributesSchema = z
  .record(attributeName, attributeValue)
  .transform((attributes) =>
    Object.fromEntries(
      Object.entries(attributes).filter(([name]) => {
        const normalized = name.toLowerCase();
        return !ignoredAttributeNames.has(normalized) && !normalized.startsWith("on");
      }),
    ),
  );

const editableBase = {
  name: fieldName,
  label: z.string().trim().min(1).max(80),
  required: z.boolean(),
  copyable: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  attributes: attributesSchema.optional(),
};

const textFieldSchema = z
  .object({
    ...editableBase,
    type: z.literal("text"),
    regex: regex.optional(),
    enum: enumValues.optional(),
  })
  .strict();

const textareaFieldSchema = z
  .object({
    ...editableBase,
    type: z.literal("textarea"),
    regex: regex.optional(),
    enum: enumValues.optional(),
  })
  .strict();

const selectFieldSchema = z
  .object({
    ...editableBase,
    type: z.literal("select"),
    options: optionsSchema,
  })
  .strict();

const fixedFieldSchema = z
  .object({
    name: fieldName,
    label: z.string().trim().min(1).max(80),
    type: z.literal("fixed"),
    value: z.string().trim().min(1).max(500),
    copyable: z.boolean().optional(),
  })
  .strict();

const methodSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    enabled: z.boolean(),
    display_name: z.string().trim().min(1).max(100),
    image_url: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(500),
    filters: z.object({ countries: z.array(countryCode).nullable() }).strict(),
    fields: z
      .array(
        z.discriminatedUnion("type", [
          textFieldSchema,
          selectFieldSchema,
          textareaFieldSchema,
          fixedFieldSchema,
        ]),
      )
      .min(1),
  })
  .strict()
  .superRefine((method, context) => {
    const names = new Set<string>();
    method.fields.forEach((field, index) => {
      if (names.has(field.name))
        context.addIssue({
          code: "custom",
          path: ["fields", index, "name"],
          message: "Field names must be unique",
        });
      names.add(field.name);
    });
  });

const configurationSchema = z
  .object({ methods: z.array(methodSchema) })
  .strict()
  .superRefine((configuration, context) => {
    const ids = new Set<string>();
    configuration.methods.forEach((method, index) => {
      if (ids.has(method.id))
        context.addIssue({
          code: "custom",
          path: ["methods", index, "id"],
          message: "Method IDs must be unique",
        });
      ids.add(method.id);
    });
  });

export type WithdrawalMethod = z.infer<typeof methodSchema>;
export type WithdrawalTextField = Extract<WithdrawalMethod["fields"][number], { type: "text" }>;

export class WithdrawalMethodRegistry {
  private readonly methods: Map<string, WithdrawalMethod>;

  constructor(configuration: unknown) {
    const parsed = configurationSchema.parse(configuration);
    this.methods = new Map(parsed.methods.map((method) => [method.id, method]));
  }

  static load(path = "config/modules/withdrawal/methods.yaml") {
    return new WithdrawalMethodRegistry(
      loadYamlConfiguration(path, process.env, { required: true }),
    );
  }

  listForAccount(account: Pick<Account, "country">) {
    return [...this.methods.values()].filter(
      (method) => method.enabled && this.isEligible(method, account.country),
    );
  }

  find(id: string) {
    return this.methods.get(id) ?? null;
  }

  requireAvailable(id: string, account: Pick<Account, "country">) {
    const method = this.find(id);
    if (!method || !method.enabled || !this.isEligible(method, account.country))
      throw new Error("Withdrawal method is unavailable for this account");
    return method;
  }

  enrich(method: WithdrawalMethod, values: Record<string, string>): DestinationField[] {
    const editable = new Set(
      method.fields.filter((field) => field.type !== "fixed").map((field) => field.name),
    );
    for (const name of Object.keys(values)) {
      if (!editable.has(name))
        throw new Error(`Unknown or non-editable withdrawal field: ${name}`);
    }

    const enriched: DestinationField[] = [];
    for (const field of method.fields) {
      const copyable = field.copyable ?? false;
      if (field.type === "fixed") {
        enriched.push({
          name: field.name,
          label: field.label,
          value: field.value,
          type: field.type,
          copyable,
        });
        continue;
      }

      const raw = values[field.name];
      const value = raw?.trim();
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required`);
        continue;
      }

      if (field.type === "select") {
        const option = field.options.find((candidate) => candidate.key === value);
        if (!option) throw new Error(`${field.label} has an invalid value`);
        enriched.push({
          name: field.name,
          label: field.label,
          value,
          displayValue: option.value,
          type: field.type,
          copyable,
        });
        continue;
      }

      if (field.enum && !field.enum.includes(value))
        throw new Error(`${field.label} has an invalid value`);

      if (field.regex) {
        const match = new RegExp(field.regex).exec(value);
        if (!match || match[0] !== value)
          throw new Error(`${field.label} has an invalid format`);
      }

      enriched.push({
        name: field.name,
        label: field.label,
        value,
        type: field.type,
        copyable,
      });
    }
    return enriched;
  }

  reconcile(method: WithdrawalMethod, fields: readonly DestinationField[]) {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const configured = method.fields.find((candidate) => candidate.name === field.name);
      if (!configured || field.type !== configured.type)
        throw new Error(
          "Saved withdrawal destination no longer matches its method; update it before use",
        );
      if (configured.type === "fixed") {
        if (field.value !== configured.value)
          throw new Error(
            "Saved withdrawal destination no longer matches its method; update it before use",
          );
      } else {
        values[configured.name] = field.value;
      }
    }
    return this.enrich(method, values);
  }

  private isEligible(method: WithdrawalMethod, country: string | null) {
    const allowed = method.filters.countries;
    return allowed === null || (country !== null && allowed.includes(country));
  }
}
