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
const textFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    type: z.literal("text"),
    required: z.boolean(),
    placeholder: z.string().max(200).optional(),
    pattern: z
      .string()
      .max(256)
      .refine((value) => value.startsWith("^") && value.endsWith("$"), {
        message: "Text field patterns must be anchored to the full value",
      })
      .refine((value) => {
        try {
          new RegExp(value);
          return true;
        } catch {
          return false;
        }
      }, "Text field pattern is not a valid regular expression")
      .optional(),
    input_mode: z.enum(["text", "numeric", "decimal", "tel", "email", "url"]).optional(),
    copyable: z.boolean(),
  })
  .strict();
const fixedFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    type: z.literal("fixed"),
    value: z.string().trim().min(1).max(500),
    copyable: z.boolean(),
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
    fields: z.array(z.discriminatedUnion("type", [textFieldSchema, fixedFieldSchema])).min(1),
  })
  .strict()
  .superRefine((method, context) => {
    const keys = new Set<string>();
    method.fields.forEach((field, index) => {
      if (keys.has(field.key))
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: "Field keys must be unique",
        });
      keys.add(field.key);
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
      method.fields.filter((field) => field.type === "text").map((field) => field.key),
    );
    for (const key of Object.keys(values)) {
      if (!editable.has(key)) throw new Error(`Unknown or non-editable withdrawal field: ${key}`);
    }
    const enriched: DestinationField[] = [];
    for (const field of method.fields) {
      if (field.type === "fixed") {
        enriched.push({
          key: field.key,
          label: field.label,
          value: field.value,
          type: field.type,
          copyable: field.copyable,
        });
        continue;
      }
      const raw = values[field.key];
      const value = raw?.trim();
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required`);
        continue;
      }
      if (field.pattern) {
        const match = new RegExp(field.pattern).exec(value);
        if (!match || match[0] !== value) throw new Error(`${field.label} has an invalid format`);
      }
      enriched.push({
        key: field.key,
        label: field.label,
        value,
        type: field.type,
        copyable: field.copyable,
      });
    }
    return enriched;
  }

  reconcile(method: WithdrawalMethod, fields: readonly DestinationField[]) {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const configured = method.fields.find((candidate) => candidate.key === field.key);
      if (!configured || field.type !== configured.type)
        throw new Error(
          "Saved withdrawal destination no longer matches its method; update it before use",
        );
      if (configured.type === "text") values[configured.key] = field.value;
      else if (field.value !== configured.value)
        throw new Error(
          "Saved withdrawal destination no longer matches its method; update it before use",
        );
    }
    return this.enrich(method, values);
  }

  private isEligible(method: WithdrawalMethod, country: string | null) {
    const allowed = method.filters.countries;
    return allowed === null || (country !== null && allowed.includes(country));
  }
}
