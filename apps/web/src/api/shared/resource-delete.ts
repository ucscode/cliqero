import { z } from "@hono/zod-openapi";
import { crudMaxRows } from "@/config/crud";
import { publicErrorPayload } from "@/api/error";

/** Canonical bounded request body shared by public resource DELETE operations. */
export function resourceDeleteSchema(override?: number) {
  const maximum = crudMaxRows(override);
  return z
    .object({
      ids: z.array(z.string().uuid()).min(1).max(maximum),
    })
    .strict()
    .superRefine(({ ids }, context) => {
      if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length)
        context.addIssue({ code: "custom", path: ["ids"], message: "IDs must be unique." });
    });
}

export type ResourceDeleteResult = {
  results: Array<{ id: string; deleted: boolean; error: string | null }>;
};

/** Applies one resource's existing deletion rule and reports each supplied ID. */
export async function deleteResourceIds(
  ids: readonly string[],
  remove: (id: string) => Promise<unknown> | unknown,
  fallbackMessage = "Resource could not be deleted.",
): Promise<ResourceDeleteResult> {
  const results: ResourceDeleteResult["results"] = [];
  for (const id of ids) {
    try {
      const outcome = await remove(id);
      const reported =
        outcome && typeof outcome === "object" && "deleted" in outcome
          ? (outcome as { deleted?: unknown }).deleted
          : undefined;
      results.push({
        id,
        deleted: reported === false ? false : true,
        error: reported === false ? fallbackMessage : null,
      });
    } catch (error) {
      results.push({
        id,
        deleted: false,
        error: publicErrorPayload(error)?.payload.error ?? fallbackMessage,
      });
    }
  }
  return { results };
}
